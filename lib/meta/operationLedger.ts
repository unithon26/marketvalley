import "server-only";

import { assertSafeExternalId } from "@/lib/meta/contracts";

export const metaOperationSteps = [
  "image:0",
  "image:1",
  "image:2",
  "image:3",
  "image:4",
  "campaign",
  "ad-set",
  "creative",
  "ad",
] as const;

export type MetaOperationStep = (typeof metaOperationSteps)[number];
export type MetaOperationStatus = "OPEN" | "RECONCILIATION_REQUIRED" | "COMPLETED";

export type MetaOperationResult = {
  operationKey: string;
  imageHashes: readonly string[];
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  status: "PAUSED";
};

export type MetaOperationRecord = {
  operationKey: string;
  fingerprint: string;
  status: MetaOperationStatus;
  checkpoints: Partial<Record<MetaOperationStep, string>>;
  attemptingStep?: MetaOperationStep;
  reconciliationStep?: MetaOperationStep;
  reconciliationHistory?: readonly MetaReconciliationAudit[];
  result?: MetaOperationResult;
};

export type MetaReconciliationAudit = {
  step: MetaOperationStep;
  outcome: "VERIFIED_CREATED" | "VERIFIED_NOT_CREATED";
  externalId?: string;
  resolvedBy: string;
  note: string;
  resolvedAt: string;
};

export type MetaReconciliationResolution =
  | {
      step: MetaOperationStep;
      outcome: "VERIFIED_CREATED";
      externalId: string;
      resolvedBy: string;
      note: string;
    }
  | {
      step: MetaOperationStep;
      outcome: "VERIFIED_NOT_CREATED";
      resolvedBy: string;
      note: string;
    };

export type MetaOperationDescriptor = {
  operationKey: string;
  fingerprint: string;
};

export interface MetaOperationSession {
  read(): MetaOperationRecord;
  /** Persist before any external write so a process crash cannot become a blind retry. */
  beginAttempt(step: MetaOperationStep): Promise<void>;
  checkpoint(step: MetaOperationStep, externalId: string): Promise<void>;
  requireReconciliation(step: MetaOperationStep): Promise<void>;
  complete(result: MetaOperationResult): Promise<void>;
}

/**
 * A production implementation must serialize each operation key with a durable,
 * renewable lease. The lease must cover reads and every checkpoint; a process-local
 * mutex is insufficient for serverless or multi-instance deployment.
 */
export interface MetaOperationLedger {
  withExclusiveOperation<T>(
    descriptor: MetaOperationDescriptor,
    run: (session: MetaOperationSession) => Promise<T>,
  ): Promise<T>;
  /** Operator-only seam. A live implementation must append an immutable audit entry atomically. */
  resolveReconciliation(
    descriptor: MetaOperationDescriptor,
    resolution: unknown,
  ): Promise<MetaOperationRecord>;
}

export class MetaOperationConflictError extends Error {
  constructor() {
    super("같은 Meta 작업 키가 다른 입력과 충돌했습니다.");
    this.name = "MetaOperationConflictError";
  }
}

export class MetaOperationBusyError extends Error {
  constructor() {
    super("같은 Meta 광고 초안 작업이 이미 진행 중입니다.");
    this.name = "MetaOperationBusyError";
  }
}

export class MetaOperationLedgerUnavailableError extends Error {
  constructor() {
    super("Meta 광고 작업 기록을 안전하게 저장하지 못했습니다.");
    this.name = "MetaOperationLedgerUnavailableError";
  }
}

export class MetaOperationNeedsReconciliationError extends Error {
  readonly operationKey: string;
  readonly step: MetaOperationStep;

  constructor(operationKey: string, step: MetaOperationStep) {
    super("Meta 응답이 불확실해 자동 재시도를 중단했습니다. Ads Manager와 작업 기록을 대조해 주세요.");
    this.name = "MetaOperationNeedsReconciliationError";
    this.operationKey = operationKey;
    this.step = step;
  }
}

export class MetaReconciliationResolutionError extends Error {
  constructor(message = "Meta reconciliation 상태와 확인 결과가 일치하지 않습니다.") {
    super(message);
    this.name = "MetaReconciliationResolutionError";
  }
}

export function parseMetaReconciliationResolution(input: unknown): MetaReconciliationResolution {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new MetaReconciliationResolutionError();
  }
  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.step !== "string" ||
    !metaOperationSteps.includes(candidate.step as MetaOperationStep)
  ) {
    throw new MetaReconciliationResolutionError("Meta reconciliation 단계가 올바르지 않습니다.");
  }
  if (candidate.outcome !== "VERIFIED_CREATED" && candidate.outcome !== "VERIFIED_NOT_CREATED") {
    throw new MetaReconciliationResolutionError("Meta reconciliation 확인 결과가 올바르지 않습니다.");
  }
  let resolvedBy: string;
  try {
    resolvedBy = assertSafeExternalId("Meta reconciliation operator", candidate.resolvedBy);
  } catch {
    throw new MetaReconciliationResolutionError("Meta reconciliation 운영자 ID가 올바르지 않습니다.");
  }
  if (typeof candidate.note !== "string") {
    throw new MetaReconciliationResolutionError("Meta reconciliation 근거가 필요합니다.");
  }
  const note = candidate.note.trim();
  if (note.length < 8 || note.length > 500) {
    throw new MetaReconciliationResolutionError("Meta reconciliation 근거를 8~500자로 기록해야 합니다.");
  }
  const step = candidate.step as MetaOperationStep;
  if (candidate.outcome === "VERIFIED_CREATED") {
    let externalId: string;
    try {
      externalId = assertSafeExternalId(`Meta ${step}`, candidate.externalId);
    } catch {
      throw new MetaReconciliationResolutionError("확인된 Meta 외부 ID가 올바르지 않습니다.");
    }
    return { step, outcome: candidate.outcome, externalId, resolvedBy, note };
  }
  if (candidate.externalId !== undefined) {
    throw new MetaReconciliationResolutionError("미생성 확인에는 Meta 외부 ID를 기록할 수 없습니다.");
  }
  return { step, outcome: candidate.outcome, resolvedBy, note };
}
