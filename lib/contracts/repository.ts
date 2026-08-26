import type { CampaignSpec, NextAction } from "@/lib/contracts/campaign";
import type { IdeaInput } from "@/lib/contracts/generator";

export const campaignLifecycleStatuses = [
  "SUBMITTED",
  "GENERATING",
  "PREPARING",
  "AWAITING_ACTIVATION",
  "COLLECTING",
  "FINALIZING",
  "COMPLETED",
  "RETRY_WAIT",
  "FAILED",
  "ARCHIVED",
] as const;

export type CampaignLifecycleStatus = typeof campaignLifecycleStatuses[number];

export type CampaignLifecycleRecord = {
  id: string;
  draftId: string;
  status: CampaignLifecycleStatus;
  spec: CampaignSpec | null;
  slug: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  preparationCompletedAt: string | null;
  collectionStartedAt: string | null;
  collectionEndsAt: string | null;
  completedAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type PublishedCampaign = {
  id: string;
  slug: string;
  spec: CampaignSpec;
  publishedAt: string;
  nextAction: NextAction | null;
};

export type ReservationUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export type ReservationInput = {
  campaignId: string;
  name: string;
  email: string;
  consent: true;
  turnstileToken?: string;
  utm?: ReservationUtm;
};

export type ReservationRecord = {
  id: string;
  name: string;
  email: string;
  utm?: ReservationUtm;
  reservedAt: string;
};

export type ReservationSummary = {
  total: number;
  recent: ReservationRecord[];
};

export type NextActionInput = {
  campaignId: string;
  draftId: string;
  nextAction: NextAction;
};

export type DeleteCampaignInput = {
  campaignId: string;
  draftId: string;
};

/** 같은 이메일이 같은 캠페인에 두 번째로 예약하려 할 때 던진다. */
export class DuplicateSignalError extends Error {
  constructor() {
    super("email already reserved this campaign");
    this.name = "DuplicateSignalError";
  }
}

export class ReservationRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number, readonly reason: "rate_limited" | "capacity") {
    super(`reservation ${reason}`);
    this.name = "ReservationRateLimitError";
  }
}

export class ReservationStoreUnavailableError extends Error {
  constructor() {
    super("reservation store unavailable");
    this.name = "ReservationStoreUnavailableError";
  }
}

export class CampaignNotFoundError extends Error {
  constructor() {
    super("campaign not found");
    this.name = "CampaignNotFoundError";
  }
}

export class DraftConflictError extends Error {
  constructor() {
    super("draft is already published with a different campaign spec");
    this.name = "DraftConflictError";
  }
}

export class DraftOwnershipError extends Error {
  constructor() {
    super("draft does not own this campaign");
    this.name = "DraftOwnershipError";
  }
}

export class CampaignDeletionBlockedError extends Error {
  constructor(readonly reason: "processing" | "live_ad" | "external_state_unknown") {
    super(`campaign deletion blocked: ${reason}`);
    this.name = "CampaignDeletionBlockedError";
  }
}

export interface CampaignRepository {
  createSubmission(draftId: string, input: IdeaInput): Promise<CampaignLifecycleRecord>;
  getLifecycle(id: string): Promise<CampaignLifecycleRecord | null>;
  listLifecycle(): Promise<CampaignLifecycleRecord[]>;
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getById(id: string): Promise<PublishedCampaign | null>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordReservation(input: ReservationInput): Promise<void>;
  getReservationSummary(campaignId: string): Promise<ReservationSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
  delete(input: DeleteCampaignInput): Promise<void>;
}
