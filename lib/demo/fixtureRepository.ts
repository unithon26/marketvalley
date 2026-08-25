import { createHash } from "node:crypto";

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
  type CampaignLifecycleRecord,
  type CampaignRepository,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type ReservationInput,
  type ReservationRecord,
  type ReservationSummary,
} from "@/lib/contracts/repository";
import { summarizeReservations } from "@/lib/demo/campaignReservations";
import {
  demoCampaign,
  demoCampaignId,
  demoCampaignSlug,
} from "@/lib/demo/demo-campaign";

type StoredCampaign = CampaignLifecycleRecord & {
  fingerprint: string | null;
  nextAction: PublishedCampaign["nextAction"];
  input: IdeaInput | null;
};

export type FixtureCampaignRepositoryOptions = {
  now?: () => Date;
  seedDemoCampaign?: boolean;
  seedReservations?: readonly Omit<ReservationRecord, "id">[];
};

function fingerprint(spec: CampaignSpec): string {
  return JSON.stringify(spec);
}

function copyLifecycle(campaign: StoredCampaign): CampaignLifecycleRecord {
  return {
    id: campaign.id,
    draftId: campaign.draftId,
    status: campaign.status,
    spec: campaign.spec ? structuredClone(campaign.spec) : null,
    slug: campaign.slug,
    publishedAt: campaign.publishedAt,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    preparationCompletedAt: campaign.preparationCompletedAt,
    collectionStartedAt: campaign.collectionStartedAt,
    collectionEndsAt: campaign.collectionEndsAt,
    completedAt: campaign.completedAt,
    nextAttemptAt: campaign.nextAttemptAt,
    lastErrorCode: campaign.lastErrorCode,
    lastErrorMessage: campaign.lastErrorMessage,
  };
}

function copyPublished(campaign: StoredCampaign): PublishedCampaign {
  if (!campaign.spec || !campaign.slug || !campaign.publishedAt) {
    throw new CampaignNotFoundError();
  }
  return {
    id: campaign.id,
    slug: campaign.slug,
    spec: structuredClone(campaign.spec),
    publishedAt: campaign.publishedAt,
    nextAction: campaign.nextAction,
  };
}

function fixtureEmailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export class FixtureCampaignRepository implements CampaignRepository {
  private readonly campaigns = new Map<string, StoredCampaign>();
  private readonly campaignIdsBySlug = new Map<string, string>();
  private readonly campaignIdsByDraft = new Map<string, string>();
  private readonly reservations = new Map<string, Map<string, ReservationRecord>>();
  private readonly now: () => Date;
  private readonly initialReservations: readonly Omit<ReservationRecord, "id">[];
  private sequence = 1;

  constructor(options: FixtureCampaignRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.initialReservations = options.seedReservations ?? [];

    if (options.seedDemoCampaign === true) {
      const timestamp = demoCampaign.generation.generatedAt;
      this.insertCampaign({
        id: demoCampaignId,
        draftId: demoCampaignId,
        status: "COMPLETED",
        spec: demoCampaign,
        slug: demoCampaignSlug,
        publishedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        preparationCompletedAt: timestamp,
        collectionStartedAt: timestamp,
        collectionEndsAt: timestamp,
        completedAt: timestamp,
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        fingerprint: fingerprint(demoCampaign),
        nextAction: null,
        input: null,
      });
    }
  }

  async createSubmission(draftId: string, input: IdeaInput): Promise<CampaignLifecycleRecord> {
    const normalizedDraftId = draftId.trim();
    const parsedInput = ideaInputSchema.parse(input);
    const existingId = this.campaignIdsByDraft.get(normalizedDraftId);
    if (existingId) {
      const existing = this.requireCampaign(existingId);
      if (
        existing.input?.background !== parsedInput.background
        || existing.input?.solution !== parsedInput.solution
      ) throw new DraftConflictError();
      return copyLifecycle(existing);
    }

    const timestamp = this.now().toISOString();
    const campaign = this.insertCampaign({
      id: `fixture-${this.sequence++}`,
      draftId: normalizedDraftId,
      status: "SUBMITTED",
      spec: null,
      slug: null,
      publishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      preparationCompletedAt: null,
      collectionStartedAt: null,
      collectionEndsAt: null,
      completedAt: null,
      nextAttemptAt: timestamp,
      lastErrorCode: null,
      lastErrorMessage: null,
      fingerprint: null,
      nextAction: null,
      input: parsedInput,
    });
    return copyLifecycle(campaign);
  }

  async getLifecycle(id: string): Promise<CampaignLifecycleRecord | null> {
    const campaign = this.campaigns.get(id);
    return campaign ? copyLifecycle(campaign) : null;
  }

  async listLifecycle(): Promise<CampaignLifecycleRecord[]> {
    return [...this.campaigns.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(copyLifecycle);
  }

  async publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign> {
    const normalizedDraftId = draftId.trim();
    const parsedSpec = campaignSpecSchema.parse(structuredClone(spec));
    const existingId = this.campaignIdsByDraft.get(normalizedDraftId);

    if (existingId) {
      const existing = this.requireCampaign(existingId);
      if (existing.fingerprint && existing.fingerprint !== fingerprint(parsedSpec)) {
        throw new DraftConflictError();
      }
      if (!existing.spec) this.materialize(existing, parsedSpec);
      return copyPublished(existing);
    }

    const timestamp = this.now().toISOString();
    const sequence = this.sequence++;
    const campaign = this.insertCampaign({
      id: `fixture-${sequence}`,
      draftId: normalizedDraftId,
      status: "COMPLETED",
      spec: parsedSpec,
      slug: this.uniqueSlug(`campaign-${sequence}`),
      publishedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      preparationCompletedAt: timestamp,
      collectionStartedAt: timestamp,
      collectionEndsAt: timestamp,
      completedAt: timestamp,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      fingerprint: fingerprint(parsedSpec),
      nextAction: null,
      input: null,
    });
    return copyPublished(campaign);
  }

  async getById(id: string): Promise<PublishedCampaign | null> {
    const campaign = this.campaigns.get(id);
    return campaign?.spec ? copyPublished(campaign) : null;
  }

  async getBySlug(slug: string): Promise<PublishedCampaign | null> {
    const id = this.campaignIdsBySlug.get(slug);
    if (!id) return null;
    return copyPublished(this.requireCampaign(id));
  }

  async recordReservation(input: ReservationInput): Promise<void> {
    const campaign = this.requireCampaign(input.campaignId);
    if (!campaign.spec) throw new CampaignNotFoundError();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const records = this.requireReservations(campaign.id);
    const emailHash = fixtureEmailHash(email);

    if (records.has(emailHash)) throw new DuplicateSignalError();
    records.set(emailHash, {
      id: `${campaign.id}-reservation-${records.size + 1}`,
      name,
      email,
      utm: input.utm,
      reservedAt: this.now().toISOString(),
    });
  }

  async getReservationSummary(campaignId: string): Promise<ReservationSummary> {
    const campaign = this.requireCampaign(campaignId);
    if (!campaign.spec) throw new CampaignNotFoundError();
    return summarizeReservations([...this.requireReservations(campaign.id).values()]);
  }

  async saveNextAction(input: NextActionInput): Promise<NextActionInput["nextAction"]> {
    const campaign = this.requireCampaign(input.campaignId);
    this.assertDraftOwnership(campaign, input.draftId);
    campaign.nextAction = nextActionSchema.parse(input.nextAction);
    return campaign.nextAction;
  }

  async delete(input: DeleteCampaignInput): Promise<void> {
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) return;
    this.assertDraftOwnership(campaign, input.draftId);
    this.removeCampaign(campaign);
  }

  private materialize(campaign: StoredCampaign, spec: CampaignSpec): void {
    const timestamp = this.now().toISOString();
    campaign.spec = structuredClone(spec);
    campaign.slug = this.uniqueSlug(`campaign-${this.sequence++}`);
    campaign.publishedAt = timestamp;
    campaign.status = "COMPLETED";
    campaign.updatedAt = timestamp;
    campaign.preparationCompletedAt = timestamp;
    campaign.collectionStartedAt = timestamp;
    campaign.collectionEndsAt = timestamp;
    campaign.completedAt = timestamp;
    campaign.nextAttemptAt = null;
    campaign.fingerprint = fingerprint(spec);
    this.campaignIdsBySlug.set(campaign.slug, campaign.id);
  }

  private insertCampaign(campaign: StoredCampaign): StoredCampaign {
    this.campaigns.set(campaign.id, campaign);
    if (campaign.slug) this.campaignIdsBySlug.set(campaign.slug, campaign.id);
    this.campaignIdsByDraft.set(campaign.draftId, campaign.id);
    this.reservations.set(campaign.id, this.createInitialReservationMap());
    return campaign;
  }

  private createInitialReservationMap(): Map<string, ReservationRecord> {
    return new Map(this.initialReservations.map((seed, index) => {
      const record: ReservationRecord = { id: `fixture-${index + 1}`, ...seed };
      return [fixtureEmailHash(record.email), record] as const;
    }));
  }

  private removeCampaign(campaign: StoredCampaign): void {
    this.campaigns.delete(campaign.id);
    if (campaign.slug) this.campaignIdsBySlug.delete(campaign.slug);
    this.campaignIdsByDraft.delete(campaign.draftId);
    this.reservations.delete(campaign.id);
  }

  private requireCampaign(id: string): StoredCampaign {
    const campaign = this.campaigns.get(id);
    if (!campaign) throw new CampaignNotFoundError();
    return campaign;
  }

  private requireReservations(campaignId: string): Map<string, ReservationRecord> {
    const reservations = this.reservations.get(campaignId);
    if (!reservations) throw new CampaignNotFoundError();
    return reservations;
  }

  private assertDraftOwnership(campaign: StoredCampaign, draftId: string): void {
    if (campaign.draftId !== draftId.trim()) throw new DraftOwnershipError();
  }

  private uniqueSlug(candidate: string): string {
    if (!this.campaignIdsBySlug.has(candidate)) return candidate;
    let suffix = 2;
    while (this.campaignIdsBySlug.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
  }
}
