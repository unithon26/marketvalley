import { createHash } from "node:crypto";

import {
  campaignSpecSchema,
  nextActionSchema,
  signalOptionIdSchema,
  type CampaignSpec,
  type SignalOptionId,
} from "@/lib/contracts/campaign";
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
  InvalidSignalOptionError,
  type CampaignRepository,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type ResetCampaignInput,
  type SignalInput,
  type SignalSummary,
} from "@/lib/contracts/repository";
import { aggregateSignals } from "@/lib/demo/campaignSignals";
import {
  demoCampaign,
  demoCampaignId,
  demoCampaignSlug,
  seedSignals,
} from "@/lib/demo/demo-campaign";

type StoredCampaign = PublishedCampaign & {
  draftId: string;
  fingerprint: string;
};

export type FixtureCampaignRepositoryOptions = {
  now?: () => Date;
  seedDemoCampaign?: boolean;
  seedResponses?: readonly SignalOptionId[];
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

function fixtureVisitorHash(visitorId: string): string {
  return createHash("sha256").update(visitorId).digest("hex");
}

export class FixtureCampaignRepository implements CampaignRepository {
  private readonly campaigns = new Map<string, StoredCampaign>();
  private readonly campaignIdsBySlug = new Map<string, string>();
  private readonly campaignIdsByDraft = new Map<string, string>();
  private readonly signals = new Map<string, Map<string, SignalOptionId>>();
  private readonly now: () => Date;
  private readonly seedResponses: readonly SignalOptionId[];
  private sequence = 1;

  constructor(options: FixtureCampaignRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.seedResponses = options.seedResponses ?? seedSignals;

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
    const id = this.campaignIdsBySlug.get(slug) ?? (this.campaigns.has(slug) ? slug : undefined);
    if (!id) return null;
    return copyCampaign(this.requireCampaign(id));
  }

  async recordSignal(input: SignalInput): Promise<SignalSummary> {
    const campaign = this.requireCampaign(input.campaignId);
    const visitorId = input.visitorId.trim();
    const optionId = signalOptionIdSchema.parse(input.optionId);
    const allowedOptions = new Set(campaign.spec.validation.signal.options.map((option) => option.id));

    if (!allowedOptions.has(optionId)) {
      throw new InvalidSignalOptionError();
    }

    const responses = this.requireSignals(campaign.id);
    const visitorHash = fixtureVisitorHash(visitorId);
    if (responses.has(visitorHash)) {
      throw new DuplicateSignalError();
    }

    responses.set(visitorHash, optionId);
    return this.summarize(campaign, responses);
  }

  async getSignalSummary(campaignId: string): Promise<SignalSummary> {
    const campaign = this.requireCampaign(campaignId);
    return this.summarize(campaign, this.requireSignals(campaignId));
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
    this.signals.set(campaign.id, this.createSeedSignalMap());
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
    this.signals.set(campaign.id, this.createSeedSignalMap());
    return campaign;
  }

  private createSeedSignalMap(): Map<string, SignalOptionId> {
    return new Map(this.seedResponses.map((optionId, index) => [`fixture-seed-${index + 1}`, optionId]));
  }

  private removeCampaign(campaign: StoredCampaign): void {
    this.campaigns.delete(campaign.id);
    this.campaignIdsBySlug.delete(campaign.slug);
    this.campaignIdsByDraft.delete(campaign.draftId);
    this.signals.delete(campaign.id);
  }

  private requireCampaign(id: string): StoredCampaign {
    const campaign = this.campaigns.get(id);
    if (!campaign) throw new CampaignNotFoundError();
    return campaign;
  }

  private requireSignals(campaignId: string): Map<string, SignalOptionId> {
    const responses = this.signals.get(campaignId);
    if (!responses) throw new CampaignNotFoundError();
    return responses;
  }

  private summarize(
    campaign: StoredCampaign,
    responses: ReadonlyMap<string, SignalOptionId>,
  ): SignalSummary {
    return aggregateSignals([...responses.values()], campaign.spec);
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
