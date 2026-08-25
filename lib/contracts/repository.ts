import type { CampaignSpec, NextAction } from "@/lib/contracts/campaign";

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

export type ResetCampaignInput = DeleteCampaignInput;

/** 같은 이메일이 같은 캠페인에 두 번째로 예약하려 할 때 던진다. */
export class DuplicateSignalError extends Error {
  constructor() {
    super("email already reserved this campaign");
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

export interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getById(id: string): Promise<PublishedCampaign | null>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordReservation(input: ReservationInput): Promise<void>;
  getReservationSummary(campaignId: string): Promise<ReservationSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
  reset(input: ResetCampaignInput): Promise<PublishedCampaign>;
  delete(input: DeleteCampaignInput): Promise<void>;
}
