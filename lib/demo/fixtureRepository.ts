import { createHash } from "node:crypto";

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
import {
  demoCampaign,
  demoCampaignId,
  demoCampaignSlug,
  seedReservations as defaultSeedReservations,
} from "@/lib/demo/demo-campaign";

type StoredCampaign = PublishedCampaign & {
  draftId: string;
  fingerprint: string;
};

export type FixtureCampaignRepositoryOptions = {
  now?: () => Date;
  seedDemoCampaign?: boolean;
  seedReservations?: readonly Omit<ReservationRecord, "id">[];
};

const knownSlugBases: Record<string, string> = {
  "마감한입": "magamhanip",
  "동네공방 빈자리": "workshop-vacancy",
  "클래스 문의형": "class-inquiry",
};

function fingerprint(spec: CampaignSpec): string {
  return JSON.stringify(spec);
}

function copyCampaign(campaign: StoredCampaign): PublishedCampaign {
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
  private readonly seedReservations: readonly Omit<ReservationRecord, "id">[];
  private sequence = 1;

  constructor(options: FixtureCampaignRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.seedReservations = options.seedReservations ?? defaultSeedReservations;

    if (options.seedDemoCampaign ?? true) {
      this.insertCampaign({
        id: demoCampaignId,
        slug: demoCampaignSlug,
        draftId: demoCampaignId,
        spec: demoCampaign,
        publishedAt: demoCampaign.generation.generatedAt,
        nextAction: null,
      });
    }
  }

  async publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign> {
    const normalizedDraftId = draftId.trim();
    const parsedSpec = campaignSpecSchema.parse(structuredClone(spec));
    const existingId = this.campaignIdsByDraft.get(normalizedDraftId);

    if (existingId) {
      const existing = this.requireCampaign(existingId);
      if (existing.fingerprint !== fingerprint(parsedSpec)) {
        throw new DraftConflictError();
      }
      return copyCampaign(existing);
    }

    const sequence = this.sequence++;
    const id = `fixture-${sequence}`;
    const slugBase = knownSlugBases[parsedSpec.project.name] ?? "campaign";
    const campaign = this.insertCampaign({
      id,
      slug: this.uniqueSlug(`${slugBase}-${sequence}`),
      draftId: normalizedDraftId,
      spec: parsedSpec,
      publishedAt: this.now().toISOString(),
      nextAction: null,
    });

    return copyCampaign(campaign);
  }

  async getById(id: string): Promise<PublishedCampaign | null> {
    const campaign = this.campaigns.get(id);
    return campaign ? copyCampaign(campaign) : null;
  }

  async getBySlug(slug: string): Promise<PublishedCampaign | null> {
    const id = this.campaignIdsBySlug.get(slug);
    if (!id) return null;
    return copyCampaign(this.requireCampaign(id));
  }

  async recordReservation(input: ReservationInput): Promise<ReservationSummary> {
    const campaign = this.requireCampaign(input.campaignId);
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const records = this.requireReservations(campaign.id);
    const emailHash = fixtureEmailHash(email);

    if (records.has(emailHash)) {
      throw new DuplicateSignalError();
    }

    const record: ReservationRecord = {
      id: `${campaign.id}-reservation-${records.size + 1}`,
      name,
      email,
      utm: input.utm,
      reservedAt: this.now().toISOString(),
    };
    records.set(emailHash, record);
    return summarizeReservations([...records.values()]);
  }

  async getReservationSummary(campaignId: string): Promise<ReservationSummary> {
    const campaign = this.requireCampaign(campaignId);
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

  async reset(input: ResetCampaignInput): Promise<PublishedCampaign> {
    const campaign = this.requireCampaign(input.campaignId);
    this.assertDraftOwnership(campaign, input.draftId);
    campaign.nextAction = null;
    this.reservations.set(campaign.id, this.createSeedReservationMap());
    return copyCampaign(campaign);
  }

  private insertCampaign(input: Omit<StoredCampaign, "fingerprint">): StoredCampaign {
    const parsedSpec = campaignSpecSchema.parse(structuredClone(input.spec));
    const campaign: StoredCampaign = {
      ...input,
      spec: parsedSpec,
      fingerprint: fingerprint(parsedSpec),
    };

    this.campaigns.set(campaign.id, campaign);
    this.campaignIdsBySlug.set(campaign.slug, campaign.id);
    this.campaignIdsByDraft.set(campaign.draftId, campaign.id);
    this.reservations.set(campaign.id, this.createSeedReservationMap());
    return campaign;
  }

  private createSeedReservationMap(): Map<string, ReservationRecord> {
    return new Map(this.seedReservations.map((seed, index) => {
      const record: ReservationRecord = { id: `seed-${index + 1}`, ...seed };
      return [fixtureEmailHash(record.email), record] as const;
    }));
  }

  private removeCampaign(campaign: StoredCampaign): void {
    this.campaigns.delete(campaign.id);
    this.campaignIdsBySlug.delete(campaign.slug);
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
    const normalizedDraftId = draftId.trim();
    if (campaign.draftId !== normalizedDraftId) {
      throw new DraftOwnershipError();
    }
  }

  private uniqueSlug(candidate: string): string {
    if (!this.campaignIdsBySlug.has(candidate)) return candidate;

    let suffix = 2;
    while (this.campaignIdsBySlug.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
  }
}
