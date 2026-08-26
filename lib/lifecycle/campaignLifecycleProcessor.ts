import "server-only";

import { randomUUID } from "node:crypto";

import { createCampaignGenerator } from "@/lib/ai/campaignGenerator";
import {
  CampaignGenerationError,
  isPermanentCampaignGenerationError,
} from "@/lib/ai/anthropicCampaignGenerator";
import type { CampaignLifecycleStatus, PublishedCampaign } from "@/lib/contracts/repository";
import { CampaignLifecycleStore, type ClaimedCampaign } from "@/lib/lifecycle/campaignLifecycleStore";
import { deriveMetaPausedDraftInput } from "@/lib/meta/campaignDraftInput";
import { MetaConfigurationError, MetaInputError } from "@/lib/meta/contracts";
import {
  assertMetaAutomaticActivationAuthorized,
  createGraphMetaAdsProviderFromEnvironment,
  isMetaAutomaticActivationConfigured,
  isMetaDraftOperator,
  readMetaConfiguredBinding,
  readMetaPausedDraftServerPolicy,
  type MetaPausedDraftServerPolicy,
} from "@/lib/meta/metaConfig";
import {
  getLatestMetaAdRun,
  registerMetaAdRun,
  updateMetaAdRun,
  type MetaAdRun,
} from "@/lib/meta/metaAdRun";
import {
  activateMetaRun,
  collectMetaInsight,
  getMetaRunObjectStatuses,
  MetaActivationReconciliationRequiredError,
  pauseMetaRun,
} from "@/lib/meta/metaRunLifecycle";
import { MetaOperationNeedsReconciliationError } from "@/lib/meta/operationLedger";
import { PausedCarouselDraftService } from "@/lib/meta/pausedCarouselDraftService";
import {
  type MetaOperationRpcClient,
  SupabaseMetaOperationLedger,
} from "@/lib/meta/supabaseMetaOperationLedger";
import { renderCampaignCarouselPngAssets } from "@/lib/rendering/carouselImage";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

type Environment = Record<string, string | undefined>;

export type CampaignLifecycleProcessResult = {
  processed: number;
  lastCampaignId: string | null;
  lastStatus: CampaignLifecycleStatus | null;
};

const permanentEffectiveStatuses = new Set([
  "ARCHIVED",
  "DELETED",
  "DISAPPROVED",
  "ERROR",
  "WITH_ISSUES",
]);

function integerSetting(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/u.test(raw)) throw new Error(`${name} is invalid`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function after(now: Date, milliseconds: number): string {
  return new Date(now.getTime() + milliseconds).toISOString();
}

function needsFreshMetaDraftWindow(options: {
  startsAt: string | null;
  endsAt: string | null;
  now: Date;
}): boolean {
  const startsAt = options.startsAt === null ? Number.NaN : new Date(options.startsAt).getTime();
  const endsAt = options.endsAt === null ? Number.NaN : new Date(options.endsAt).getTime();
  const now = options.now.getTime();
  return !Number.isFinite(startsAt)
    || !Number.isFinite(endsAt)
    || !Number.isFinite(now)
    || endsAt <= now;
}

function publishedCampaign(campaign: ClaimedCampaign): PublishedCampaign {
  if (!campaign.spec || !campaign.slug || !campaign.publishedAt) {
    throw new Error("campaign materialization is incomplete");
  }
  return {
    id: campaign.id,
    slug: campaign.slug,
    spec: campaign.spec,
    publishedAt: campaign.publishedAt,
    nextAction: null,
  };
}

function stablePolicy(
  campaign: ClaimedCampaign,
  environment: Environment,
  now: Date,
): MetaPausedDraftServerPolicy {
  if (!campaign.collectionStartedAt || !campaign.collectionEndsAt) {
    throw new Error("campaign collection window is missing");
  }
  return {
    ...readMetaPausedDraftServerPolicy(environment, now),
    startsAt: campaign.collectionStartedAt,
    endsAt: campaign.collectionEndsAt,
  };
}

function errorCode(error: unknown): string {
  if (error instanceof CampaignGenerationError) return error.code;
  if (error instanceof MetaOperationNeedsReconciliationError) return "meta_reconciliation_required";
  if (error instanceof MetaActivationReconciliationRequiredError) {
    return "meta_activation_reconciliation_required";
  }
  if (error instanceof MetaConfigurationError) return "meta_configuration_error";
  if (error instanceof MetaInputError) return "meta_input_error";
  const name = error instanceof Error ? error.name : "unknown_error";
  return name
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9_]/gu, "_")
    .toLowerCase()
    .slice(0, 80) || "unknown_error";
}

function userSafeFailureMessage(stage: CampaignLifecycleStatus): string {
  switch (stage) {
    case "GENERATING":
      return "AI 문구 생성이 반복해서 완료되지 않았습니다. 입력 내용은 저장되어 있습니다.";
    case "PREPARING":
      return "광고 소재 또는 Meta 게시 준비를 안전하게 완료하지 못했습니다.";
    case "AWAITING_ACTIVATION":
      return "Meta 광고 활성화 상태를 확인하지 못해 자동 집행을 중단했습니다.";
    case "COLLECTING":
    case "FINALIZING":
      return "실제 광고 집계 데이터를 확인하지 못했습니다. 저장된 데이터는 유지됩니다.";
    default:
      return "광고 처리 중 확인이 필요한 문제가 발생했습니다.";
  }
}

function isPermanentFailure(error: unknown): boolean {
  if (
    error instanceof MetaOperationNeedsReconciliationError
    || error instanceof MetaActivationReconciliationRequiredError
    || error instanceof MetaConfigurationError
    || error instanceof MetaInputError
  ) return true;
  if (error instanceof CampaignGenerationError) {
    return isPermanentCampaignGenerationError(error);
  }
  return false;
}

function targetStage(campaign: ClaimedCampaign): Exclude<
  CampaignLifecycleStatus,
  "SUBMITTED" | "RETRY_WAIT" | "FAILED" | "COMPLETED" | "ARCHIVED"
> {
  if (campaign.spec === null) return "GENERATING";
  if (campaign.status === "RETRY_WAIT" && campaign.retryFromStatus) {
    if (
      campaign.retryFromStatus === "GENERATING"
      || campaign.retryFromStatus === "PREPARING"
      || campaign.retryFromStatus === "AWAITING_ACTIVATION"
      || campaign.retryFromStatus === "COLLECTING"
      || campaign.retryFromStatus === "FINALIZING"
    ) return campaign.retryFromStatus;
  }
  if (
    campaign.status === "GENERATING"
    || campaign.status === "PREPARING"
    || campaign.status === "AWAITING_ACTIVATION"
    || campaign.status === "COLLECTING"
    || campaign.status === "FINALIZING"
  ) return campaign.status;
  return "PREPARING";
}

async function prepareMetaDraft(options: {
  campaign: ClaimedCampaign;
  environment: Environment;
  now: Date;
}): Promise<MetaAdRun> {
  const { campaign, environment, now } = options;
  if (!isMetaDraftOperator(campaign.ownerId, environment)) {
    throw new MetaConfigurationError("자동 Meta 게시가 허용된 계정이 아닙니다.");
  }
  const client = createSupabaseServiceClient(environment);
  const binding = readMetaConfiguredBinding(environment);
  const policy = stablePolicy(campaign, environment, now);
  const published = publishedCampaign(campaign);
  const images = await renderCampaignCarouselPngAssets({
    spec: published.spec,
    origin: binding.allowedDestinationOrigins[0],
  });
  const service = new PausedCarouselDraftService(
    createGraphMetaAdsProviderFromEnvironment(environment),
    new SupabaseMetaOperationLedger({
      client: client as unknown as MetaOperationRpcClient,
      ownerId: campaign.ownerId,
      campaignId: campaign.id,
    }),
    binding,
  );
  const result = await service.create(deriveMetaPausedDraftInput({
    campaign: published,
    images,
    destinationOrigin: binding.allowedDestinationOrigins[0],
    policy,
  }));
  return registerMetaAdRun({
    client,
    ownerId: campaign.ownerId,
    campaignId: campaign.id,
    adAccountId: binding.adAccountId,
    policy,
    result,
  });
}

export async function processClaimedCampaign(options: {
  initialCampaign: ClaimedCampaign;
  store: CampaignLifecycleStore;
  environment: Environment;
  now: () => Date;
}): Promise<CampaignLifecycleStatus> {
  const { store, environment } = options;
  const client = createSupabaseServiceClient(environment);
  let campaign = options.initialCampaign;
  const stage = targetStage(campaign);

  try {
    if (campaign.stageAttempts >= 10 || (stage === "GENERATING" && campaign.generationAttempts >= 3)) {
      await store.transition(campaign, {
        status: "FAILED",
        lastErrorCode: "retry_limit_exceeded",
        lastErrorMessage: userSafeFailureMessage(stage),
      });
      return "FAILED";
    }

    campaign = await store.renew(campaign, stage);
    const now = options.now();

    if (stage === "GENERATING") {
      if (!campaign.input) throw new MetaInputError("저장된 아이디어 입력이 없습니다.");
      const spec = await createCampaignGenerator(environment).generate(campaign.input);
      await store.transition(campaign, {
        status: "PREPARING",
        spec,
        slug: `campaign-${randomUUID().slice(0, 8)}`,
        publishedAt: now.toISOString(),
        nextAttemptAt: now.toISOString(),
        clearError: true,
      });
      return "PREPARING";
    }

    if (stage === "PREPARING") {
      const existingRun = await getLatestMetaAdRun({
        client,
        ownerId: campaign.ownerId,
        campaignId: campaign.id,
      });
      if (existingRun) {
        await store.transition(campaign, {
          status: "AWAITING_ACTIVATION",
          preparationCompletedAt: campaign.preparationCompletedAt ?? now.toISOString(),
          collectionStartedAt: existingRun.startsAt,
          collectionEndsAt: existingRun.endsAt,
          nextAttemptAt: now.toISOString(),
          clearError: true,
        });
        return "AWAITING_ACTIVATION";
      }

      if (needsFreshMetaDraftWindow({
        startsAt: campaign.collectionStartedAt,
        endsAt: campaign.collectionEndsAt,
        now,
      })) {
        const policy = readMetaPausedDraftServerPolicy(environment, now);
        await store.transition(campaign, {
          status: "PREPARING",
          collectionStartedAt: policy.startsAt,
          collectionEndsAt: policy.endsAt,
          nextAttemptAt: now.toISOString(),
          clearError: true,
        });
        return "PREPARING";
      }

      const run = await prepareMetaDraft({ campaign, environment, now });
      await store.transition(campaign, {
        status: "AWAITING_ACTIVATION",
        preparationCompletedAt: now.toISOString(),
        collectionStartedAt: run.startsAt,
        collectionEndsAt: run.endsAt,
        nextAttemptAt: now.toISOString(),
        clearError: true,
      });
      return "AWAITING_ACTIVATION";
    }

    const run = await getLatestMetaAdRun({
      client,
      ownerId: campaign.ownerId,
      campaignId: campaign.id,
    });
    if (!run) throw new Error("Meta ad run is missing");
    const provider = createGraphMetaAdsProviderFromEnvironment(environment);

    if (stage === "AWAITING_ACTIVATION") {
      if (now.getTime() >= new Date(run.endsAt).getTime()) {
        const paused = run.status === "PAUSED" ? run : await pauseMetaRun({ client, provider, run });
        await collectMetaInsight({ client, provider, run: paused, final: false });
        await store.transition(campaign, {
          status: "FINALIZING",
          nextAttemptAt: after(now, 60_000),
          clearError: true,
        });
        return "FINALIZING";
      }

      if (run.status === "PAUSED" || run.status === "FAILED") {
        if (!isMetaAutomaticActivationConfigured(campaign.ownerId, environment)) {
          await store.transition(campaign, {
            status: "AWAITING_ACTIVATION",
            nextAttemptAt: after(now, 15 * 60_000),
            clearError: true,
          });
          return "AWAITING_ACTIVATION";
        }
        assertMetaAutomaticActivationAuthorized(campaign.ownerId, environment);
        await activateMetaRun({ client, provider, run, approvedBy: campaign.ownerId });
        await store.transition(campaign, {
          status: "AWAITING_ACTIVATION",
          nextAttemptAt: after(now, 60_000),
          clearError: true,
        });
        return "AWAITING_ACTIVATION";
      }

      if (run.status === "PAUSING") {
        await store.transition(campaign, {
          status: "FINALIZING",
          nextAttemptAt: after(now, 60_000),
          clearError: true,
        });
        return "FINALIZING";
      }

      const statuses = await getMetaRunObjectStatuses(provider, run);
      const effectiveStatuses = Object.values(statuses).map((status) => status.effectiveStatus);
      if (effectiveStatuses.some((status) => permanentEffectiveStatuses.has(status))) {
        throw new Error("Meta ad delivery is not eligible");
      }
      if (
        run.status === "ACTIVATING"
        && Object.values(statuses).every((status) => status.configuredStatus === "ACTIVE")
      ) {
        await updateMetaAdRun({
          client,
          run,
          status: "ACTIVE",
          expectedStatuses: ["ACTIVATING"],
        });
      }
      if (effectiveStatuses.every((status) => status === "ACTIVE")) {
        await store.transition(campaign, {
          status: "COLLECTING",
          collectionStartedAt: run.startsAt,
          collectionEndsAt: run.endsAt,
          nextAttemptAt: after(now, 5 * 60_000),
          clearError: true,
        });
        return "COLLECTING";
      }
      await store.transition(campaign, {
        status: "AWAITING_ACTIVATION",
        nextAttemptAt: after(now, 60_000),
        clearError: true,
      });
      return "AWAITING_ACTIVATION";
    }

    if (stage === "COLLECTING") {
      const statuses = await getMetaRunObjectStatuses(provider, run);
      if (Object.values(statuses).some((status) => (
        status.configuredStatus !== "ACTIVE"
        && now.getTime() < new Date(run.endsAt).getTime()
      ))) {
        throw new Error("Meta ad stopped before collection ended");
      }
      await collectMetaInsight({ client, provider, run, final: false });
      if (now.getTime() < new Date(run.endsAt).getTime()) {
        await store.transition(campaign, {
          status: "COLLECTING",
          nextAttemptAt: after(now, 5 * 60_000),
          clearError: true,
        });
        return "COLLECTING";
      }
      const paused = run.status === "PAUSED" ? run : await pauseMetaRun({ client, provider, run });
      await store.transition(campaign, {
        status: "FINALIZING",
        collectionEndsAt: paused.endsAt,
        nextAttemptAt: after(now, 60_000),
        clearError: true,
      });
      return "FINALIZING";
    }

    const finalizationDelayMinutes = integerSetting(
      environment,
      "META_INSIGHTS_FINALIZATION_DELAY_MINUTES",
      60,
      1,
      24 * 60,
    );
    const finalizationBase = Math.max(
      new Date(run.endsAt).getTime(),
      run.pausedAt ? new Date(run.pausedAt).getTime() : 0,
    );
    const finalizationAt = finalizationBase + finalizationDelayMinutes * 60_000;
    if (run.status !== "PAUSED") await pauseMetaRun({ client, provider, run });
    if (now.getTime() < finalizationAt) {
      await collectMetaInsight({ client, provider, run, final: false });
      await store.transition(campaign, {
        status: "FINALIZING",
        nextAttemptAt: new Date(finalizationAt).toISOString(),
        clearError: true,
      });
      return "FINALIZING";
    }
    await collectMetaInsight({ client, provider, run, final: true });
    await store.transition(campaign, {
      status: "COMPLETED",
      completedAt: now.toISOString(),
      clearError: true,
    });
    return "COMPLETED";
  } catch (error) {
    const code = errorCode(error);
    console.error("campaign lifecycle stage failed", {
      campaignId: campaign.id,
      stage,
      attempt: campaign.stageAttempts,
      code,
    });
    const terminal = isPermanentFailure(error) || campaign.stageAttempts >= (
      stage === "COLLECTING" || stage === "FINALIZING" ? 10 : 3
    );
    await store.transition(campaign, {
      status: terminal ? "FAILED" : "RETRY_WAIT",
      nextAttemptAt: terminal
        ? undefined
        : after(options.now(), Math.min(30, 2 ** campaign.stageAttempts) * 60_000),
      lastErrorCode: code,
      lastErrorMessage: terminal
        ? userSafeFailureMessage(stage)
        : "일시적인 문제로 자동 재시도 중입니다. 입력과 진행 기록은 안전하게 보관됩니다.",
    });
    return terminal ? "FAILED" : "RETRY_WAIT";
  }
}

export async function processCampaignLifecycle(options: {
  campaignId?: string;
  maximumSteps?: number;
  environment?: Environment;
  now?: () => Date;
} = {}): Promise<CampaignLifecycleProcessResult> {
  const environment = options.environment ?? process.env;
  const client = createSupabaseServiceClient(environment);
  const store = new CampaignLifecycleStore(client);
  const maximumSteps = options.maximumSteps ?? 5;
  const now = options.now ?? (() => new Date());
  let processed = 0;
  let lastCampaignId: string | null = null;
  let lastStatus: CampaignLifecycleStatus | null = null;

  for (let index = 0; index < maximumSteps; index += 1) {
    const campaign = await store.claim(options.campaignId);
    if (!campaign) break;
    lastCampaignId = campaign.id;
    lastStatus = await processClaimedCampaign({ initialCampaign: campaign, store, environment, now });
    processed += 1;
    if (
      options.campaignId
      && (lastStatus === "RETRY_WAIT"
        || lastStatus === "FAILED"
        || lastStatus === "COMPLETED")
    ) break;
  }

  return { processed, lastCampaignId, lastStatus };
}
