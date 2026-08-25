import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  campaignSpecSchema,
  nextActionSchema,
  type CampaignSpec,
} from "@/lib/contracts/campaign";
import { ideaInputSchema, type IdeaInput } from "@/lib/contracts/generator";
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
  ReservationRateLimitError,
  ReservationStoreUnavailableError,
  type CampaignRepository,
  type CampaignLifecycleRecord,
  type CampaignLifecycleStatus,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type ReservationInput,
  type ReservationRecord,
  type ReservationSummary,
} from "@/lib/contracts/repository";
import { summarizeReservations } from "@/lib/demo/campaignReservations";
import type { ReservationProtectionLimits } from "@/lib/security/reservationProtection";

type CampaignRow = {
  id: string;
  draft_id: string;
  slug: string | null;
  spec: unknown | null;
  next_action: unknown;
  published_at: string | null;
  input_background: string | null;
  input_solution: string | null;
  lifecycle_status: CampaignLifecycleStatus;
  next_attempt_at: string | null;
  preparation_completed_at: string | null;
  collection_started_at: string | null;
  collection_ends_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ReservationRow = {
  id: string;
  name: string;
  email: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  reserved_at: string;
};

type DatabaseError = { code?: string; message?: string };

const campaignColumns = "id, draft_id, slug, spec, next_action, published_at, input_background, input_solution, lifecycle_status, next_attempt_at, preparation_completed_at, collection_started_at, collection_ends_at, completed_at, last_error_code, last_error_message, created_at, updated_at";
const reservationColumns = "id, name, email, utm_source, utm_medium, utm_campaign, utm_content, reserved_at";

function isDatabaseError(error: unknown): error is DatabaseError {
  return typeof error === "object" && error !== null;
}

function databaseFailure(operation: string, error: unknown): Error {
  const code = isDatabaseError(error) && typeof error.code === "string" ? ` (${error.code})` : "";
  return new Error(`Supabase ${operation} failed${code}`);
}

function toPublishedCampaign(row: CampaignRow): PublishedCampaign {
  if (row.slug === null || row.spec === null || row.published_at === null) {
    throw new Error("campaign is not published");
  }
  return {
    id: row.id,
    slug: row.slug,
    spec: campaignSpecSchema.parse(row.spec),
    publishedAt: row.published_at,
    nextAction: row.next_action === null ? null : nextActionSchema.parse(row.next_action),
  };
}

function toLifecycleRecord(row: CampaignRow): CampaignLifecycleRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    status: row.lifecycle_status,
    spec: row.spec === null ? null : campaignSpecSchema.parse(row.spec),
    slug: row.slug,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preparationCompletedAt: row.preparation_completed_at,
    collectionStartedAt: row.collection_started_at,
    collectionEndsAt: row.collection_ends_at,
    completedAt: row.completed_at,
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
  };
}

function toReservationRecord(row: ReservationRow): ReservationRecord {
  const utm = {
    source: row.utm_source ?? undefined,
    medium: row.utm_medium ?? undefined,
    campaign: row.utm_campaign ?? undefined,
    content: row.utm_content ?? undefined,
  };
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ...(Object.values(utm).some((value) => value !== undefined) ? { utm } : {}),
    reservedAt: row.reserved_at,
  };
}

function fingerprint(spec: CampaignSpec): string {
  return JSON.stringify(campaignSpecSchema.parse(spec));
}

export type SupabaseCampaignRepositoryOptions = {
  ownerClient?: SupabaseClient;
  serviceClient: SupabaseClient;
  hashSecret: string;
  now?: () => Date;
  slugSuffix?: () => string;
  reservationLimits?: ReservationProtectionLimits;
};

/**
 * 소유자 작업은 cookie session client로 실행해 RLS를 적용한다.
 * service client는 공개 snapshot 조회와 검증된 예약 저장에만 사용한다.
 */
export class SupabaseCampaignRepository implements CampaignRepository {
  private readonly ownerClient?: SupabaseClient;
  private readonly serviceClient: SupabaseClient;
  private readonly hashSecret: string;
  private readonly now: () => Date;
  private readonly slugSuffix: () => string;
  private readonly reservationLimits?: ReservationProtectionLimits;

  constructor(options: SupabaseCampaignRepositoryOptions) {
    this.ownerClient = options.ownerClient;
    this.serviceClient = options.serviceClient;
    this.hashSecret = options.hashSecret;
    this.now = options.now ?? (() => new Date());
    this.slugSuffix = options.slugSuffix ?? (() => randomUUID().slice(0, 8));
    this.reservationLimits = options.reservationLimits;
  }

  async createSubmission(draftId: string, input: IdeaInput): Promise<CampaignLifecycleRecord> {
    const client = this.requireOwnerClient();
    const normalizedDraftId = draftId.trim();
    const parsedInput = ideaInputSchema.parse(input);
    const existing = await this.findOwnerCampaignByDraft(normalizedDraftId);
    if (existing) {
      const inputMatches = existing.input_background === parsedInput.background
        && existing.input_solution === parsedInput.solution;
      if (!inputMatches) throw new DraftConflictError();
      return toLifecycleRecord(existing);
    }

    const { data, error } = await client
      .from("campaigns")
      .insert({
        draft_id: normalizedDraftId,
        input_background: parsedInput.background,
        input_solution: parsedInput.solution,
      })
      .select(campaignColumns)
      .single();

    if (error || !data) {
      if (isDatabaseError(error) && error.code === "23505") {
        const concurrent = await this.findOwnerCampaignByDraft(normalizedDraftId);
        if (concurrent) {
          const inputMatches = concurrent.input_background === parsedInput.background
            && concurrent.input_solution === parsedInput.solution;
          if (!inputMatches) throw new DraftConflictError();
          return toLifecycleRecord(concurrent);
        }
      }
      throw databaseFailure("campaign submission", error);
    }

    return toLifecycleRecord(data as CampaignRow);
  }

  async getLifecycle(id: string): Promise<CampaignLifecycleRecord | null> {
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .select(campaignColumns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseFailure("campaign lifecycle lookup", error);
    return data ? toLifecycleRecord(data as CampaignRow) : null;
  }

  async listLifecycle(): Promise<CampaignLifecycleRecord[]> {
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .select(campaignColumns)
      .order("updated_at", { ascending: false });
    if (error) throw databaseFailure("campaign lifecycle list", error);
    return ((data ?? []) as CampaignRow[]).map(toLifecycleRecord);
  }

  async publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign> {
    const client = this.requireOwnerClient();
    const normalizedDraftId = draftId.trim();
    const parsedSpec = campaignSpecSchema.parse(structuredClone(spec));
    const existing = await this.findOwnerCampaignByDraft(normalizedDraftId);
    if (existing && existing.spec !== null) {
      return this.assertIdempotentDraft(existing, parsedSpec);
    }

    const timestamp = this.now().toISOString();
    if (existing) {
      const { data, error } = await client
        .from("campaigns")
        .update({
          slug: `campaign-${this.slugSuffix()}`,
          spec: parsedSpec,
          published_at: timestamp,
          lifecycle_status: "PREPARING",
          next_attempt_at: timestamp,
          last_error_code: null,
          last_error_message: null,
          updated_at: timestamp,
        })
        .eq("id", existing.id)
        .is("spec", null)
        .select(campaignColumns)
        .maybeSingle();
      if (error) throw databaseFailure("campaign materialization", error);
      if (data) return toPublishedCampaign(data as CampaignRow);
      const concurrent = await this.findOwnerCampaignByDraft(normalizedDraftId);
      if (concurrent && concurrent.spec !== null) {
        return this.assertIdempotentDraft(concurrent, parsedSpec);
      }
      throw databaseFailure("campaign materialization", null);
    }

    const { data, error } = await client
      .from("campaigns")
      .insert({
        draft_id: normalizedDraftId,
        slug: `campaign-${this.slugSuffix()}`,
        spec: parsedSpec,
        next_action: null,
        published_at: timestamp,
        lifecycle_status: "PREPARING",
        next_attempt_at: timestamp,
        updated_at: timestamp,
      })
      .select(campaignColumns)
      .single();

    if (error || !data) {
      if (isDatabaseError(error) && error.code === "23505") {
        const concurrent = await this.findOwnerCampaignByDraft(normalizedDraftId);
        if (concurrent) return this.assertIdempotentDraft(concurrent, parsedSpec);
      }
      throw databaseFailure("campaign publish", error);
    }

    return toPublishedCampaign(data as CampaignRow);
  }

  async getById(id: string): Promise<PublishedCampaign | null> {
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .select(campaignColumns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseFailure("campaign lookup", error);
    if (!data || (data as CampaignRow).spec === null) return null;
    return toPublishedCampaign(data as CampaignRow);
  }

  async getBySlug(slug: string): Promise<PublishedCampaign | null> {
    const { data, error } = await this.serviceClient
      .from("campaigns")
      .select(campaignColumns)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw databaseFailure("public campaign lookup", error);
    if (!data || (data as CampaignRow).spec === null) return null;
    return toPublishedCampaign(data as CampaignRow);
  }

  async recordReservation(input: ReservationInput): Promise<void> {
    if (!this.reservationLimits) throw new ReservationStoreUnavailableError();
    const normalizedEmail = input.email.trim().toLowerCase();
    const timestamp = this.now().toISOString();
    const { data, error } = await this.serviceClient.rpc("record_campaign_reservation", {
      p_campaign_id: input.campaignId,
      p_name: input.name.trim(),
      p_email: normalizedEmail,
      p_email_hash: this.emailHash(normalizedEmail),
      p_consent_version: "reservation-v1",
      p_consented_at: timestamp,
      p_utm_source: input.utm?.source ?? null,
      p_utm_medium: input.utm?.medium ?? null,
      p_utm_campaign: input.utm?.campaign ?? null,
      p_utm_content: input.utm?.content ?? null,
      p_reserved_at: timestamp,
      p_campaign_minute_limit: this.reservationLimits.campaignMinute,
      p_global_minute_limit: this.reservationLimits.globalMinute,
      p_campaign_total_limit: this.reservationLimits.campaignTotal,
    });

    if (error) throw new ReservationStoreUnavailableError();
    const result = Array.isArray(data) ? data[0] : data;
    if (result === "inserted") return;
    if (result === "duplicate") throw new DuplicateSignalError();
    if (result === "not_found") throw new CampaignNotFoundError();
    if (result === "rate_limited") throw new ReservationRateLimitError(60, result);
    if (result === "capacity") throw new ReservationRateLimitError(86_400, result);
    throw new ReservationStoreUnavailableError();
  }

  async getReservationSummary(campaignId: string): Promise<ReservationSummary> {
    await this.requireOwnerCampaign(campaignId);
    return this.getReservationSummaryWithClient(this.requireOwnerClient(), campaignId);
  }

  async saveNextAction(input: NextActionInput): Promise<NextActionInput["nextAction"]> {
    const campaign = await this.requireOwnerCampaign(input.campaignId);
    this.assertDraftOwnership(campaign, input.draftId);
    const nextAction = nextActionSchema.parse(input.nextAction);
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .update({ next_action: nextAction })
      .eq("id", input.campaignId)
      .select("id")
      .maybeSingle();
    if (error) throw databaseFailure("next action update", error);
    if (!data) throw new CampaignNotFoundError();
    return nextAction;
  }

  async delete(input: DeleteCampaignInput): Promise<void> {
    const stored = await this.requireOwnerCampaign(input.campaignId);
    this.assertDraftOwnership(stored, input.draftId);
    const { data, error } = await this.requireOwnerClient().rpc(
      "delete_owned_unstarted_campaign",
      {
        p_campaign_id: input.campaignId,
        p_draft_id: input.draftId.trim(),
      },
    );
    if (error) throw databaseFailure("campaign delete", error);
    if (data !== true) throw new CampaignNotFoundError();
  }

  private requireOwnerClient(): SupabaseClient {
    if (!this.ownerClient) throw new Error("owner-scoped Supabase client is required");
    return this.ownerClient;
  }

  private emailHash(email: string): string {
    return createHmac("sha256", this.hashSecret).update(email).digest("hex");
  }

  private async findOwnerCampaignByDraft(draftId: string): Promise<CampaignRow | null> {
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .select(campaignColumns)
      .eq("draft_id", draftId)
      .maybeSingle();
    if (error) throw databaseFailure("draft lookup", error);
    return data ? data as CampaignRow : null;
  }

  private assertIdempotentDraft(row: CampaignRow, spec: CampaignSpec): PublishedCampaign {
    const campaign = toPublishedCampaign(row);
    if (fingerprint(campaign.spec) !== fingerprint(spec)) throw new DraftConflictError();
    return campaign;
  }

  private async requireOwnerCampaign(id: string): Promise<CampaignRow> {
    const { data, error } = await this.requireOwnerClient()
      .from("campaigns")
      .select(campaignColumns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseFailure("owner campaign lookup", error);
    if (!data) throw new CampaignNotFoundError();
    return data as CampaignRow;
  }

  private async getReservationSummaryWithClient(
    client: SupabaseClient,
    campaignId: string,
  ): Promise<ReservationSummary> {
    const { data, error } = await client
      .from("campaign_reservations")
      .select(reservationColumns)
      .eq("campaign_id", campaignId)
      .order("reserved_at", { ascending: false });
    if (error) throw databaseFailure("reservation lookup", error);
    return summarizeReservations(((data ?? []) as ReservationRow[]).map(toReservationRecord));
  }

  private assertDraftOwnership(campaign: CampaignRow, draftId: string): void {
    if (campaign.draft_id !== draftId.trim()) throw new DraftOwnershipError();
  }
}
