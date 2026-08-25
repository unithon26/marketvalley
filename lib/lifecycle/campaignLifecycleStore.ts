import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import {
  campaignLifecycleStatuses,
  type CampaignLifecycleStatus,
} from "@/lib/contracts/repository";
import { ideaInputSchema, type IdeaInput } from "@/lib/contracts/generator";

const lifecycleStatusSet = new Set<string>(campaignLifecycleStatuses);

export type ClaimedCampaign = {
  id: string;
  ownerId: string;
  draftId: string;
  status: CampaignLifecycleStatus;
  retryFromStatus: CampaignLifecycleStatus | null;
  stageAttempts: number;
  generationAttempts: number;
  input: IdeaInput | null;
  spec: CampaignSpec | null;
  slug: string | null;
  publishedAt: string | null;
  processingToken: string;
  preparationCompletedAt: string | null;
  collectionStartedAt: string | null;
  collectionEndsAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TransitionInput = {
  status: CampaignLifecycleStatus;
  spec?: CampaignSpec;
  slug?: string;
  publishedAt?: string;
  nextAttemptAt?: string;
  preparationCompletedAt?: string;
  collectionStartedAt?: string;
  collectionEndsAt?: string;
  completedAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  clearError?: boolean;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("campaign lifecycle row is invalid");
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`campaign lifecycle ${name} is invalid`);
  }
  return value;
}

function optionalString(row: Record<string, unknown>, name: string): string | null {
  const value = row[name];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`campaign lifecycle ${name} is invalid`);
  }
  return value;
}

function integer(row: Record<string, unknown>, name: string): number {
  const value = row[name];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`campaign lifecycle ${name} is invalid`);
  }
  return Number(value);
}

function lifecycleStatus(value: unknown, nullable = false): CampaignLifecycleStatus | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !lifecycleStatusSet.has(value)) {
    throw new Error("campaign lifecycle status is invalid");
  }
  return value as CampaignLifecycleStatus;
}

function parseClaim(value: unknown): ClaimedCampaign {
  const row = record(value);
  const background = optionalString(row, "input_background");
  const solution = optionalString(row, "input_solution");
  const input = background === null || solution === null
    ? null
    : ideaInputSchema.parse({ background, solution });
  return {
    id: requiredString(row, "id"),
    ownerId: requiredString(row, "owner_id"),
    draftId: requiredString(row, "draft_id"),
    status: lifecycleStatus(row.lifecycle_status)!,
    retryFromStatus: lifecycleStatus(row.retry_from_status, true),
    stageAttempts: integer(row, "stage_attempts"),
    generationAttempts: integer(row, "generation_attempts"),
    input,
    spec: row.spec === null ? null : campaignSpecSchema.parse(row.spec),
    slug: optionalString(row, "slug"),
    publishedAt: optionalString(row, "published_at"),
    processingToken: requiredString(row, "processing_token"),
    preparationCompletedAt: optionalString(row, "preparation_completed_at"),
    collectionStartedAt: optionalString(row, "collection_started_at"),
    collectionEndsAt: optionalString(row, "collection_ends_at"),
    completedAt: optionalString(row, "completed_at"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

function firstRow(data: unknown): unknown | null {
  if (!Array.isArray(data)) throw new Error("campaign lifecycle RPC response is invalid");
  return data[0] ?? null;
}

export class CampaignLifecycleStore {
  constructor(private readonly client: SupabaseClient) {}

  async claim(campaignId?: string): Promise<ClaimedCampaign | null> {
    const { data, error } = await this.client.rpc("claim_campaign_lifecycle", {
      p_campaign_id: campaignId ?? null,
    });
    if (error) throw new Error("campaign lifecycle claim failed");
    const row = firstRow(data);
    return row === null ? null : parseClaim(row);
  }

  async renew(
    campaign: ClaimedCampaign,
    status: Exclude<CampaignLifecycleStatus, "SUBMITTED" | "RETRY_WAIT" | "FAILED" | "COMPLETED" | "ARCHIVED">,
  ): Promise<ClaimedCampaign> {
    const { data, error } = await this.client.rpc("renew_campaign_lifecycle_lease", {
      p_campaign_id: campaign.id,
      p_processing_token: campaign.processingToken,
      p_status: status,
    });
    if (error) throw new Error("campaign lifecycle lease renewal failed");
    const row = firstRow(data);
    if (row === null) throw new Error("campaign lifecycle lease lost");
    return parseClaim(row);
  }

  async transition(campaign: ClaimedCampaign, input: TransitionInput): Promise<void> {
    const { data, error } = await this.client.rpc("transition_campaign_lifecycle", {
      p_campaign_id: campaign.id,
      p_processing_token: campaign.processingToken,
      p_status: input.status,
      p_spec: input.spec ?? null,
      p_slug: input.slug ?? null,
      p_published_at: input.publishedAt ?? null,
      p_next_attempt_at: input.nextAttemptAt ?? null,
      p_preparation_completed_at: input.preparationCompletedAt ?? null,
      p_collection_started_at: input.collectionStartedAt ?? null,
      p_collection_ends_at: input.collectionEndsAt ?? null,
      p_completed_at: input.completedAt ?? null,
      p_last_error_code: input.lastErrorCode ?? null,
      p_last_error_message: input.lastErrorMessage ?? null,
      p_clear_error: input.clearError ?? false,
    });
    if (error) throw new Error("campaign lifecycle transition failed");
    if (firstRow(data) === null) throw new Error("campaign lifecycle lease lost");
  }
}
