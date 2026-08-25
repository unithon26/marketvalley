import "server-only";

import {
  META_PAUSED_STATUS,
  assertSafeExternalId,
  deriveMetaOperationDescriptor,
  type MetaAdsProvider,
  type MetaConfiguredBinding,
  type MetaPausedCarouselDraftInput,
  validateConfiguredBinding,
  validatePausedCarouselDraftInput,
} from "@/lib/meta/contracts";
import {
  type MetaOperationLedger,
  MetaOperationNeedsReconciliationError,
  type MetaOperationResult,
  type MetaOperationSession,
  type MetaOperationStep,
} from "@/lib/meta/operationLedger";

function requireCheckpoint(
  session: MetaOperationSession,
  step: MetaOperationStep,
): string | null {
  const value = session.read().checkpoints[step];
  return value ? assertSafeExternalId(`Meta ${step}`, value) : null;
}

function completedResult(session: MetaOperationSession): MetaOperationResult | null {
  const record = session.read();
  if (record.status !== "COMPLETED") return null;
  if (!record.result) throw new Error("완료된 Meta 작업에 결과가 없습니다.");
  return record.result;
}

export class PausedCarouselDraftService {
  private readonly binding: MetaConfiguredBinding;

  constructor(
    private readonly provider: MetaAdsProvider,
    private readonly ledger: MetaOperationLedger,
    configuredBinding: MetaConfiguredBinding,
  ) {
    this.binding = validateConfiguredBinding(configuredBinding);
  }

  async create(input: MetaPausedCarouselDraftInput): Promise<MetaOperationResult> {
    const validatedInput = validatePausedCarouselDraftInput(input, this.binding);
    const descriptor = deriveMetaOperationDescriptor(validatedInput, this.binding);

    return this.ledger.withExclusiveOperation(descriptor, async (session) => {
      const existingResult = completedResult(session);
      if (existingResult) return existingResult;

      const record = session.read();
      if (record.status === "RECONCILIATION_REQUIRED") {
        throw new MetaOperationNeedsReconciliationError(
          descriptor.operationKey,
          record.reconciliationStep ?? "campaign",
        );
      }
      if (record.attemptingStep) {
        await session.requireReconciliation(record.attemptingStep);
        throw new MetaOperationNeedsReconciliationError(
          descriptor.operationKey,
          record.attemptingStep,
        );
      }

      await this.provider.verifyConfiguredAssets();
      const suffix = descriptor.fingerprint.slice(0, 10);
      const imageHashes: string[] = [];
      for (const [index, image] of validatedInput.images.entries()) {
        const step = `image:${index}` as MetaOperationStep;
        const existingHash = requireCheckpoint(session, step);
        imageHashes.push(
          existingHash ?? await this.mutate(session, descriptor.operationKey, step, () =>
            this.provider.uploadImage(image)),
        );
      }

      const campaignId = requireCheckpoint(session, "campaign") ?? await this.mutate(
        session,
        descriptor.operationKey,
        "campaign",
        () => this.provider.createCampaign({
          name: `${validatedInput.name} [${suffix}]`,
          status: META_PAUSED_STATUS,
          objective: "OUTCOME_TRAFFIC",
          buyingType: "AUCTION",
          specialAdCategories: [],
        }),
      );
      const adSetId = requireCheckpoint(session, "ad-set") ?? await this.mutate(
        session,
        descriptor.operationKey,
        "ad-set",
        () => this.provider.createAdSet({
          name: `${validatedInput.name} ad set [${suffix}]`,
          status: META_PAUSED_STATUS,
          campaignId,
          billingEvent: "IMPRESSIONS",
          optimizationGoal: "LINK_CLICKS",
          bidStrategy: "LOWEST_COST_WITHOUT_CAP",
          lifetimeBudgetMinor: validatedInput.lifetimeBudgetMinor,
          startsAt: validatedInput.startsAt,
          endsAt: validatedInput.endsAt,
          targeting: validatedInput.targeting,
        }),
      );
      const creativeId = requireCheckpoint(session, "creative") ?? await this.mutate(
        session,
        descriptor.operationKey,
        "creative",
        () => this.provider.createCarouselCreative({
          name: `${validatedInput.name} creative [${suffix}]`,
          destinationUrl: validatedInput.destinationUrl,
          message: validatedInput.message,
          headline: validatedInput.headline,
          cards: validatedInput.cards.map((card, index) => ({
            ...card,
            imageHash: imageHashes[index],
          })),
        }),
      );
      const adId = requireCheckpoint(session, "ad") ?? await this.mutate(
        session,
        descriptor.operationKey,
        "ad",
        () => this.provider.createAd({
          name: `${validatedInput.name} ad [${suffix}]`,
          status: META_PAUSED_STATUS,
          adSetId,
          creativeId,
        }),
      );

      const result: MetaOperationResult = {
        operationKey: descriptor.operationKey,
        imageHashes,
        campaignId,
        adSetId,
        creativeId,
        adId,
        status: META_PAUSED_STATUS,
      };
      await session.complete(result);
      return result;
    });
  }

  private async mutate(
    session: MetaOperationSession,
    operationKey: string,
    step: MetaOperationStep,
    create: () => Promise<string>,
  ): Promise<string> {
    await session.beginAttempt(step);
    let externalId: string;
    try {
      externalId = assertSafeExternalId(`Meta ${step}`, await create());
      await session.checkpoint(step, externalId);
      return externalId;
    } catch {
      try {
        await session.requireReconciliation(step);
      } catch {
        // The durable ledger implementation must alert when even the safety marker cannot be saved.
      }
      throw new MetaOperationNeedsReconciliationError(operationKey, step);
    }
  }
}
