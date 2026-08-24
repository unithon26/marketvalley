import type { CampaignSpec, NextAction, SignalOptionId } from "@/lib/contracts/campaign";

export type PublishedCampaign = {
  id: string;
  slug: string;
  spec: CampaignSpec;
  publishedAt: string;
  nextAction: NextAction | null;
};

export type SignalInput = {
  campaignId: string;
  visitorId: string;
  optionId: SignalOptionId;
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

export type ResetCampaignInput = DeleteCampaignInput;

export type SignalCounts = Record<SignalOptionId, number>;

export type SignalDecisionStatus =
  | "no_responses"
  | "insufficient_sample"
  | "threshold_met"
  | "threshold_not_met";

export type SignalSummary = SignalCounts & {
  total: number;
  positiveRate: number | null;
  decisionStatus: SignalDecisionStatus;
  isRuleMet: boolean;
  remainingResponses: number;
  remainingPositiveResponses: number;
};

/** 같은 visitorId가 같은 캠페인에 두 번째로 응답하려 할 때 던진다. */
export class DuplicateSignalError extends Error {
  constructor() {
    super("visitor already responded to this campaign");
    this.name = "DuplicateSignalError";
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

export class InvalidSignalOptionError extends Error {
  constructor() {
    super("signal option does not belong to this campaign");
    this.name = "InvalidSignalOptionError";
  }
}

export interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getById(id: string): Promise<PublishedCampaign | null>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordSignal(input: SignalInput): Promise<SignalSummary>;
  getSignalSummary(campaignId: string): Promise<SignalSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
  reset(input: ResetCampaignInput): Promise<PublishedCampaign>;
  delete(input: DeleteCampaignInput): Promise<void>;
}
