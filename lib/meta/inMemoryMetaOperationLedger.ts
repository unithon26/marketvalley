import "server-only";

import { assertSafeExternalId } from "@/lib/meta/contracts";
import {
  MetaOperationConflictError,
  type MetaOperationDescriptor,
  type MetaOperationLedger,
  type MetaOperationRecord,
  type MetaOperationResult,
  type MetaOperationSession,
  type MetaOperationStep,
  MetaReconciliationResolutionError,
  parseMetaReconciliationResolution,
} from "@/lib/meta/operationLedger";

function cloneRecord(record: MetaOperationRecord): MetaOperationRecord {
  return {
    ...record,
    checkpoints: { ...record.checkpoints },
    reconciliationHistory: record.reconciliationHistory?.map((entry) => ({ ...entry })),
    result: record.result
      ? { ...record.result, imageHashes: [...record.result.imageHashes] }
      : undefined,
  };
}

/** Test and dry-run only. This ledger is not safe across processes or restarts. */
export class InMemoryMetaOperationLedger implements MetaOperationLedger {
  private readonly records = new Map<string, MetaOperationRecord>();
  private readonly queues = new Map<string, Promise<void>>();

  async withExclusiveOperation<T>(
    descriptor: MetaOperationDescriptor,
    run: (session: MetaOperationSession) => Promise<T>,
  ): Promise<T> {
    return this.withProcessLocalLock(descriptor.operationKey, async () => {
      const existing = this.records.get(descriptor.operationKey);
      if (existing && existing.fingerprint !== descriptor.fingerprint) {
        throw new MetaOperationConflictError();
      }
      if (!existing) {
        this.records.set(descriptor.operationKey, {
          ...descriptor,
          status: "OPEN",
          checkpoints: {},
        });
      }

      const session: MetaOperationSession = {
        read: () => cloneRecord(this.requireRecord(descriptor.operationKey)),
        beginAttempt: async (step: MetaOperationStep) => {
          const record = this.requireOpenRecord(descriptor.operationKey);
          if (record.attemptingStep && record.attemptingStep !== step) {
            throw new MetaOperationConflictError();
          }
          record.attemptingStep = step;
        },
        checkpoint: async (step: MetaOperationStep, externalId: string) => {
          const record = this.requireOpenRecord(descriptor.operationKey);
          if (record.attemptingStep !== step) throw new MetaOperationConflictError();
          const safeId = assertSafeExternalId(`Meta ${step}`, externalId);
          const previous = record.checkpoints[step];
          if (previous && previous !== safeId) throw new MetaOperationConflictError();
          record.checkpoints[step] = safeId;
          delete record.attemptingStep;
        },
        requireReconciliation: async (step: MetaOperationStep) => {
          const record = this.requireRecord(descriptor.operationKey);
          if (record.status === "COMPLETED") throw new MetaOperationConflictError();
          record.status = "RECONCILIATION_REQUIRED";
          record.reconciliationStep = step;
          delete record.attemptingStep;
        },
        complete: async (result: MetaOperationResult) => {
          const record = this.requireOpenRecord(descriptor.operationKey);
          if (result.operationKey !== descriptor.operationKey) throw new MetaOperationConflictError();
          record.status = "COMPLETED";
          record.result = { ...result, imageHashes: [...result.imageHashes] };
        },
      };
      return run(session);
    });
  }

  async resolveReconciliation(
    descriptor: MetaOperationDescriptor,
    input: unknown,
  ): Promise<MetaOperationRecord> {
    const resolution = parseMetaReconciliationResolution(input);
    return this.withProcessLocalLock(descriptor.operationKey, async () => {
      const record = this.requireRecord(descriptor.operationKey);
      if (record.fingerprint !== descriptor.fingerprint) throw new MetaOperationConflictError();
      if (
        record.status !== "RECONCILIATION_REQUIRED" ||
        record.reconciliationStep !== resolution.step
      ) {
        throw new MetaReconciliationResolutionError();
      }
      const previous = record.checkpoints[resolution.step];
      if (resolution.outcome === "VERIFIED_CREATED") {
        const externalId = assertSafeExternalId(`Meta ${resolution.step}`, resolution.externalId);
        if (previous && previous !== externalId) throw new MetaOperationConflictError();
        record.checkpoints[resolution.step] = externalId;
      } else if (previous) {
        throw new MetaReconciliationResolutionError("이미 외부 ID가 기록된 단계는 미생성으로 되돌릴 수 없습니다.");
      }
      record.reconciliationHistory = [
        ...(record.reconciliationHistory ?? []),
        {
          step: resolution.step,
          outcome: resolution.outcome,
          externalId: resolution.outcome === "VERIFIED_CREATED" ? resolution.externalId : undefined,
          resolvedBy: resolution.resolvedBy,
          note: resolution.note,
          resolvedAt: new Date().toISOString(),
        },
      ];
      record.status = "OPEN";
      delete record.attemptingStep;
      delete record.reconciliationStep;
      return cloneRecord(record);
    });
  }

  private async withProcessLocalLock<T>(operationKey: string, run: () => Promise<T>): Promise<T> {
    const predecessor = this.queues.get(operationKey) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = predecessor.then(() => lock);
    this.queues.set(operationKey, tail);
    await predecessor;

    try {
      return await run();
    } finally {
      release();
      if (this.queues.get(operationKey) === tail) {
        this.queues.delete(operationKey);
      }
    }
  }

  readForTest(operationKey: string): MetaOperationRecord | null {
    const record = this.records.get(operationKey);
    return record ? cloneRecord(record) : null;
  }

  seedForTest(record: MetaOperationRecord): void {
    this.records.set(record.operationKey, cloneRecord(record));
  }

  private requireRecord(operationKey: string): MetaOperationRecord {
    const record = this.records.get(operationKey);
    if (!record) throw new Error("Meta operation record가 없습니다.");
    return record;
  }

  private requireOpenRecord(operationKey: string): MetaOperationRecord {
    const record = this.requireRecord(operationKey);
    if (record.status !== "OPEN") throw new MetaOperationConflictError();
    return record;
  }
}
