import "server-only";

import { randomUUID } from "node:crypto";

import { assertSafeExternalId } from "@/lib/meta/contracts";
import {
  MetaOperationBusyError,
  MetaOperationConflictError,
  type MetaOperationDescriptor,
  type MetaOperationLedger,
  MetaOperationLedgerUnavailableError,
  type MetaOperationRecord,
  type MetaOperationResult,
  type MetaOperationSession,
  type MetaOperationStatus,
  type MetaOperationStep,
  type MetaReconciliationAudit,
  MetaReconciliationResolutionError,
  metaOperationSteps,
  parseMetaReconciliationResolution,
} from "@/lib/meta/operationLedger";

type RpcError = { message?: string | null } | null;
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError }>;

export type MetaOperationRpcClient = {
  rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type SupabaseMetaOperationLedgerOptions = {
  client: MetaOperationRpcClient;
  ownerId: string;
  campaignId: string;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
};

const operationKeyPattern = /^meta-paused-v1:[0-9a-f]{64}$/u;
const fingerprintPattern = /^[0-9a-f]{64}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const statuses = new Set<MetaOperationStatus>(["OPEN", "RECONCILIATION_REQUIRED", "COMPLETED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStep(value: unknown): value is MetaOperationStep {
  return typeof value === "string" && metaOperationSteps.includes(value as MetaOperationStep);
}

function safeId(label: string, value: unknown): string {
  try {
    return assertSafeExternalId(label, value);
  } catch {
    throw new MetaOperationLedgerUnavailableError();
  }
}

function optionalStep(value: unknown): MetaOperationStep | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isStep(value)) throw new MetaOperationLedgerUnavailableError();
  return value;
}

function parseResult(value: unknown, operationKey: string): MetaOperationResult | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value) || value.operationKey !== operationKey || value.status !== "PAUSED") {
    throw new MetaOperationLedgerUnavailableError();
  }
  if (!Array.isArray(value.imageHashes) || value.imageHashes.length !== 5) {
    throw new MetaOperationLedgerUnavailableError();
  }
  return {
    operationKey,
    imageHashes: value.imageHashes.map((item) => safeId("Meta image hash", item)),
    campaignId: safeId("Meta campaign ID", value.campaignId),
    adSetId: safeId("Meta ad set ID", value.adSetId),
    creativeId: safeId("Meta creative ID", value.creativeId),
    adId: safeId("Meta ad ID", value.adId),
    status: "PAUSED",
  };
}

function parseRecord(
  value: unknown,
  expected: { descriptor: MetaOperationDescriptor; ownerId: string; campaignId: string },
): MetaOperationRecord {
  if (!isRecord(value)) throw new MetaOperationLedgerUnavailableError();
  const operationKey = value.operation_key;
  const fingerprint = value.fingerprint;
  const status = value.status;
  if (
    typeof operationKey !== "string" || !operationKeyPattern.test(operationKey) ||
    operationKey !== expected.descriptor.operationKey ||
    typeof fingerprint !== "string" || !fingerprintPattern.test(fingerprint) ||
    fingerprint !== expected.descriptor.fingerprint ||
    value.owner_id !== expected.ownerId || value.campaign_id !== expected.campaignId ||
    typeof status !== "string" || !statuses.has(status as MetaOperationStatus) ||
    !isRecord(value.checkpoints)
  ) {
    throw new MetaOperationLedgerUnavailableError();
  }

  const checkpoints: Partial<Record<MetaOperationStep, string>> = {};
  for (const [step, externalId] of Object.entries(value.checkpoints)) {
    if (!isStep(step)) throw new MetaOperationLedgerUnavailableError();
    checkpoints[step] = safeId(`Meta ${step}`, externalId);
  }

  if (!Array.isArray(value.reconciliation_history)) {
    throw new MetaOperationLedgerUnavailableError();
  }
  const reconciliationHistory: MetaReconciliationAudit[] = value.reconciliation_history.map((entry) => {
    if (
      !isRecord(entry) || !isStep(entry.step) ||
      (entry.outcome !== "VERIFIED_CREATED" && entry.outcome !== "VERIFIED_NOT_CREATED") ||
      typeof entry.resolvedBy !== "string" || typeof entry.note !== "string" ||
      typeof entry.resolvedAt !== "string" || !Number.isFinite(Date.parse(entry.resolvedAt))
    ) {
      throw new MetaOperationLedgerUnavailableError();
    }
    const resolvedBy = safeId("Meta reconciliation operator", entry.resolvedBy);
    const note = entry.note.trim();
    if (note.length < 8 || note.length > 500) throw new MetaOperationLedgerUnavailableError();
    const externalId = entry.externalId === null || entry.externalId === undefined
      ? undefined
      : safeId(`Meta ${entry.step}`, entry.externalId);
    if (
      (entry.outcome === "VERIFIED_CREATED" && externalId === undefined) ||
      (entry.outcome === "VERIFIED_NOT_CREATED" && externalId !== undefined)
    ) {
      throw new MetaOperationLedgerUnavailableError();
    }
    return {
      step: entry.step,
      outcome: entry.outcome as MetaReconciliationAudit["outcome"],
      externalId,
      resolvedBy,
      note,
      resolvedAt: entry.resolvedAt,
    };
  });
  const attemptingStep = optionalStep(value.attempting_step);
  const reconciliationStep = optionalStep(value.reconciliation_step);
  if ((status === "RECONCILIATION_REQUIRED") !== (reconciliationStep !== undefined)) {
    throw new MetaOperationLedgerUnavailableError();
  }
  if (status !== "OPEN" && attemptingStep !== undefined) {
    throw new MetaOperationLedgerUnavailableError();
  }
  const result = parseResult(value.result, operationKey);
  if ((status === "COMPLETED") !== (result !== undefined)) {
    throw new MetaOperationLedgerUnavailableError();
  }
  if (result && (
    result.imageHashes.some((hash, index) => checkpoints[`image:${index}` as MetaOperationStep] !== hash) ||
    checkpoints.campaign !== result.campaignId ||
    checkpoints["ad-set"] !== result.adSetId ||
    checkpoints.creative !== result.creativeId ||
    checkpoints.ad !== result.adId
  )) {
    throw new MetaOperationLedgerUnavailableError();
  }
  return {
    operationKey,
    fingerprint,
    status: status as MetaOperationStatus,
    checkpoints,
    attemptingStep,
    reconciliationStep,
    reconciliationHistory,
    result,
  };
}

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

function mapRpcError(error: RpcError): Error {
  switch (error?.message) {
    case "meta_operation_conflict":
      return new MetaOperationConflictError();
    case "meta_operation_busy":
    case "meta_operation_lease_lost":
      return new MetaOperationBusyError();
    case "meta_reconciliation_conflict":
    case "meta_reconciliation_invalid":
      return new MetaReconciliationResolutionError();
    default:
      return new MetaOperationLedgerUnavailableError();
  }
}

function assertDescriptor(descriptor: MetaOperationDescriptor): void {
  if (!operationKeyPattern.test(descriptor.operationKey) || !fingerprintPattern.test(descriptor.fingerprint)) {
    throw new MetaOperationConflictError();
  }
}

/**
 * Designed as a service-role RPC-only durable ledger. Static SQL tests do not prove
 * PostgreSQL semantics; migrations through 202608260010 must be applied and integration-tested first.
 */
export class SupabaseMetaOperationLedger implements MetaOperationLedger {
  private readonly client: MetaOperationRpcClient;
  private readonly ownerId: string;
  private readonly campaignId: string;
  private readonly leaseSeconds: number;
  private readonly createLeaseToken: () => string;

  constructor(options: SupabaseMetaOperationLedgerOptions) {
    if (!uuidPattern.test(options.ownerId) || !uuidPattern.test(options.campaignId)) {
      throw new MetaOperationLedgerUnavailableError();
    }
    this.client = options.client;
    this.ownerId = options.ownerId;
    this.campaignId = options.campaignId;
    this.leaseSeconds = options.leaseSeconds ?? 300;
    this.createLeaseToken = options.createLeaseToken ?? randomUUID;
    if (
      !Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 30 || this.leaseSeconds > 300
    ) {
      throw new MetaOperationLedgerUnavailableError();
    }
  }

  async withExclusiveOperation<T>(
    descriptor: MetaOperationDescriptor,
    run: (session: MetaOperationSession) => Promise<T>,
  ): Promise<T> {
    assertDescriptor(descriptor);
    const leaseToken = this.createLeaseToken();
    if (!uuidPattern.test(leaseToken)) throw new MetaOperationLedgerUnavailableError();
    let record = await this.call("acquire_meta_ad_operation", {
      p_operation_key: descriptor.operationKey,
      p_fingerprint: descriptor.fingerprint,
      p_owner_id: this.ownerId,
      p_campaign_id: this.campaignId,
      p_lease_token: leaseToken,
      p_lease_seconds: this.leaseSeconds,
    });

    const transition = async (
      action: "begin" | "checkpoint" | "reconcile" | "complete",
      options: { step?: MetaOperationStep; externalId?: string; result?: MetaOperationResult } = {},
    ): Promise<void> => {
      record = await this.call("transition_meta_ad_operation", {
        p_operation_key: descriptor.operationKey,
        p_fingerprint: descriptor.fingerprint,
        p_lease_token: leaseToken,
        p_lease_seconds: this.leaseSeconds,
        p_action: action,
        p_step: options.step ?? null,
        p_external_id: options.externalId ?? null,
        p_result: options.result ?? null,
      });
    };
    const session: MetaOperationSession = {
      read: () => cloneRecord(record),
      beginAttempt: async (step) => transition("begin", { step }),
      checkpoint: async (step, externalId) => transition("checkpoint", {
        step,
        externalId: assertSafeExternalId(`Meta ${step}`, externalId),
      }),
      requireReconciliation: async (step) => transition("reconcile", { step }),
      complete: async (result) => transition("complete", { result }),
    };

    try {
      return await run(session);
    } finally {
      try {
        await this.call("transition_meta_ad_operation", {
          p_operation_key: descriptor.operationKey,
          p_fingerprint: descriptor.fingerprint,
          p_lease_token: leaseToken,
          p_lease_seconds: this.leaseSeconds,
          p_action: "release",
          p_step: null,
          p_external_id: null,
          p_result: null,
        });
      } catch {
        // Never replace the operation result/error with a best-effort lease release failure.
      }
    }
  }

  async resolveReconciliation(
    descriptor: MetaOperationDescriptor,
    input: unknown,
  ): Promise<MetaOperationRecord> {
    assertDescriptor(descriptor);
    const resolution = parseMetaReconciliationResolution(input);
    return this.call("resolve_meta_ad_operation_reconciliation", {
      p_operation_key: descriptor.operationKey,
      p_fingerprint: descriptor.fingerprint,
      p_owner_id: this.ownerId,
      p_campaign_id: this.campaignId,
      p_step: resolution.step,
      p_outcome: resolution.outcome,
      p_external_id: resolution.outcome === "VERIFIED_CREATED" ? resolution.externalId : null,
      p_resolved_by: resolution.resolvedBy,
      p_note: resolution.note,
    });
  }

  private async call(name: string, args: Record<string, unknown>): Promise<MetaOperationRecord> {
    let response: { data: unknown; error: RpcError };
    try {
      response = await this.client.rpc(name, args);
    } catch {
      throw new MetaOperationLedgerUnavailableError();
    }
    if (response.error) throw mapRpcError(response.error);
    return parseRecord(response.data, {
      descriptor: {
        operationKey: String(args.p_operation_key),
        fingerprint: String(args.p_fingerprint),
      },
      ownerId: this.ownerId,
      campaignId: this.campaignId,
    });
  }
}
