import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  campaignSpecSchema,
  nextActionSchema,
  type CampaignSpec,
} from "@/lib/contracts/campaign";
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
  ReservationRateLimitError,
  ReservationStoreUnavailableError,
  type CampaignRepository,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type ReservationInput,
  type ReservationRecord,
  type ReservationSummary,
  type ResetCampaignInput,
} from "@/lib/contracts/repository";
import { summarizeReservations } from "@/lib/demo/campaignReservations";
import type { ReservationProtectionLimits } from "@/lib/security/reservationProtection";

type CampaignRow = {
  id: string;
  draft_id: string;
  slug: string;
  spec: unknown;
  next_action: unknown;
  published_at: string;
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

const campaignColumns = "id, draft_id, slug, spec, next_action, published_at";
const reservationColumns = "id, name, email, utm_source, utm_medium, utm_campaign, utm_content, reserved_at";

const knownSlugBases: Record<string, string> = {
  "마감한입": "magamhanip",
  "동네공방 빈자리": "workshop-vacancy",
  "클래스 문의형": "class-inquiry",
};

function isDatabaseError(error: unknown): error is DatabaseError {
  return typeof error === "object" && error !== null;
}

function databaseFailure(operation: string, error: unknown): Error {
  const code = isDatabaseError(error) && typeof error.code === "string" ? ` (${error.code})` : "";
  return new Error(`Supabase ${operation} failed${code}`);
}

function toPublishedCampaign(row: CampaignRow): PublishedCampaign {
  return {
    id: row.id,
    slug: row.slug,
    spec: campaignSpecSchema.parse(row.spec),
    publishedAt: row.published_at,
    nextAction: row.next_action === null ? null : nextActionSchema.parse(row.next_action),
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

function normalizeSlugBase(projectName: string): string {
  return knownSlugBases[projectName] ?? "campaign";
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

  async publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign> {
    const client = this.requireOwnerClient();
    const normalizedDraftId = draftId.trim();
    const parsedSpec = campaignSpecSchema.parse(structuredClone(spec));
    const existing = await this.findOwnerCampaignByDraft(normalizedDraftId);
    if (existing) return this.assertIdempotentDraft(existing, parsedSpec);

    const slugBase = normalizeSlugBase(parsedSpec.project.name);
    const { data, error } = await client
      .from("campaigns")
      .insert({
        draft_id: normalizedDraftId,
        slug: `${slugBase}-${this.slugSuffix()}`,
        spec: parsedSpec,
        next_action: null,
        published_at: this.now().toISOString(),
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
    return data ? toPublishedCampaign(data as CampaignRow) : null;
  }

  async getBySlug(slug: string): Promise<PublishedCampaign | null> {
    const { data, error } = await this.serviceClient
      .from("campaigns")
      .select(campaignColumns)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw databaseFailure("public campaign lookup", error);
    return data ? toPublishedCampaign(data as CampaignRow) : null;
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

  async reset(input: ResetCampaignInput): Promise<PublishedCampaign> {
    const campaign = await this.requireOwnerCampaign(input.campaignId);
    this.assertDraftOwnership(campaign, input.draftId);
    const { data, error } = await this.requireOwnerClient().rpc("reset_owned_campaign", {
      p_campaign_id: input.campaignId,
      p_draft_id: input.draftId.trim(),
    });
    if (error) throw databaseFailure("campaign reset", error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new CampaignNotFoundError();
    return toPublishedCampaign(row as CampaignRow);
  }

  async delete(input: DeleteCampaignInput): Promise<void> {
    const campaign = await this.getById(input.campaignId);
    if (!campaign) return;
    const stored = await this.requireOwnerCampaign(input.campaignId);
    this.assertDraftOwnership(stored, input.draftId);
    const { error } = await this.requireOwnerClient()
      .from("campaigns")
      .delete()
      .eq("id", input.campaignId);
    if (error) throw databaseFailure("campaign delete", error);
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
