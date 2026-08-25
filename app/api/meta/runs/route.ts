import { z } from "zod";

import { ApiRequestError, jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";
import { requireVerifiedIdentity } from "@/lib/auth/authorization";
import { isSameOriginMutation, resolveAppOrigin } from "@/lib/auth/security";
import { createGraphMetaAdsProviderFromEnvironment, isMetaDraftOperator, readMetaConfiguredBinding } from "@/lib/meta/metaConfig";
import { getLatestMetaAdRun, storeMetaInsightSnapshot, updateMetaAdRun, type MetaAdRun } from "@/lib/meta/metaAdRun";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

export const runtime = "nodejs";

const campaignIdSchema = z.string().uuid();
const mutationSchema = z.object({
  campaignId: campaignIdSchema,
  action: z.enum(["activate", "pause"]),
  confirmAdAccountId: z.string().regex(/^\d{5,32}$/u),
  confirmLifetimeBudgetMinor: z.number().int().min(100),
}).strict();

function activationEnabled(environment: Record<string, string | undefined>): boolean {
  return environment.META_ACTIVATION_ENABLED?.trim() === "true";
}

function publicRun(run: MetaAdRun) {
  return {
    id: run.id,
    status: run.status,
    adAccountId: run.adAccountId,
    metaCampaignId: run.metaCampaignId,
    metaAdSetId: run.metaAdSetId,
    metaAdId: run.metaAdId,
    lifetimeBudgetMinor: run.lifetimeBudgetMinor,
    startsAt: run.startsAt,
    endsAt: run.endsAt,
    approvedAt: run.approvedAt,
    pausedAt: run.pausedAt,
    lastError: run.lastError,
  };
}

async function requireOperator() {
  const identity = await requireVerifiedIdentity();
  if (!isMetaDraftOperator(identity.userId)) {
    throw new ApiRequestError(403, "meta_operator_required", "Meta 운영자만 광고를 제어할 수 있습니다.");
  }
  return identity;
}

async function latestRun(ownerId: string, campaignId: string): Promise<MetaAdRun> {
  const run = await getLatestMetaAdRun({
    client: createSupabaseServiceClient(),
    ownerId,
    campaignId,
  });
  if (!run) throw new ApiRequestError(404, "meta_run_not_found", "먼저 PAUSED 광고를 만들어주세요.");
  return run;
}

async function pauseEveryObject(run: MetaAdRun): Promise<void> {
  const provider = createGraphMetaAdsProviderFromEnvironment();
  const failures: unknown[] = [];
  for (const id of [run.metaCampaignId, run.metaAdSetId, run.metaAdId]) {
    try {
      await provider.setObjectStatus(id, "PAUSED");
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new Error("Meta 광고 전체 중지 확인에 실패했습니다.");
  const statuses = await Promise.all([
    provider.getObjectStatus(run.metaCampaignId),
    provider.getObjectStatus(run.metaAdSetId),
    provider.getObjectStatus(run.metaAdId),
  ]);
  if (statuses.some((status) => status.configuredStatus !== "PAUSED")) {
    throw new Error("Meta 광고가 PAUSED 상태로 확인되지 않았습니다.");
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireOperator();
    const campaignId = campaignIdSchema.parse(new URL(request.url).searchParams.get("campaignId"));
    const run = await latestRun(identity.userId, campaignId);
    const binding = readMetaConfiguredBinding();
    if (run.adAccountId !== binding.adAccountId) throw new Error("Meta 광고계정이 현재 설정과 다릅니다.");
    const provider = createGraphMetaAdsProviderFromEnvironment();
    const [readiness, campaignStatus, adSetStatus, adStatus, insight] = await Promise.all([
      provider.getAccountReadiness(),
      provider.getObjectStatus(run.metaCampaignId),
      provider.getObjectStatus(run.metaAdSetId),
      provider.getObjectStatus(run.metaAdId),
      provider.getInsights({ objectId: run.metaCampaignId, startsAt: run.startsAt, endsAt: run.endsAt }),
    ]);
    const final = Date.now() >= new Date(run.endsAt).getTime() + 72 * 60 * 60 * 1_000;
    await storeMetaInsightSnapshot({
      client: createSupabaseServiceClient(),
      run,
      insight,
      final,
    });
    return jsonResponse({
      run: publicRun(run),
      activationEnabled: activationEnabled(process.env),
      readiness,
      objectStatuses: { campaign: campaignStatus, adSet: adSetStatus, ad: adStatus },
      insight: { ...insight, final },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const origin = resolveAppOrigin(request.url);
    if (!isSameOriginMutation(request, origin)) {
      throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 Meta 광고 제어 요청입니다.");
    }
    const identity = await requireOperator();
    const input = mutationSchema.parse(await readJsonBody(request, 4_096));
    const run = await latestRun(identity.userId, input.campaignId);
    const binding = readMetaConfiguredBinding();
    if (
      input.confirmAdAccountId !== binding.adAccountId ||
      run.adAccountId !== binding.adAccountId ||
      input.confirmLifetimeBudgetMinor !== run.lifetimeBudgetMinor ||
      run.lifetimeBudgetMinor > binding.maxLifetimeBudgetMinor
    ) {
      throw new ApiRequestError(409, "meta_activation_confirmation_mismatch", "계정 또는 예산 확인값이 현재 광고와 다릅니다.");
    }
    const client = createSupabaseServiceClient();
    if (input.action === "pause") {
      const pausing = await updateMetaAdRun({
        client,
        run,
        status: "PAUSING",
        expectedStatuses: ["ACTIVE", "ACTIVATING", "FAILED", "PAUSED"],
      });
      await pauseEveryObject(pausing);
      const paused = await updateMetaAdRun({
        client,
        run: pausing,
        status: "PAUSED",
        paused: true,
        expectedStatuses: ["PAUSING"],
      });
      return jsonResponse({ run: publicRun(paused) });
    }

    if (!activationEnabled(process.env)) {
      throw new ApiRequestError(403, "meta_activation_disabled", "실제 광고 활성화가 서버에서 잠겨 있습니다.");
    }
    if (Date.now() >= new Date(run.endsAt).getTime()) {
      throw new ApiRequestError(409, "meta_run_expired", "광고 종료 시각이 지나 새 PAUSED 광고가 필요합니다.");
    }
    const provider = createGraphMetaAdsProviderFromEnvironment();
    const readiness = await provider.getAccountReadiness();
    if (
      readiness.adAccountId !== run.adAccountId || readiness.accountStatus !== 1 ||
      readiness.disableReason !== 0 || readiness.currency !== "KRW"
    ) {
      throw new ApiRequestError(409, "meta_account_not_ready", "선택한 Meta 광고계정이 실제 집행 가능한 상태가 아닙니다.");
    }
    const activating = await updateMetaAdRun({
      client,
      run,
      status: "ACTIVATING",
      approvedBy: identity.userId,
      expectedStatuses: ["PAUSED", "FAILED"],
    });
    try {
      await provider.setObjectStatus(activating.metaAdId, "ACTIVE");
      await provider.setObjectStatus(activating.metaAdSetId, "ACTIVE");
      await provider.setObjectStatus(activating.metaCampaignId, "ACTIVE");
      const active = await updateMetaAdRun({
        client,
        run: activating,
        status: "ACTIVE",
        expectedStatuses: ["ACTIVATING"],
      });
      return jsonResponse({ run: publicRun(active), readiness });
    } catch (error) {
      try { await pauseEveryObject(activating); } catch { /* preserve activation failure */ }
      await updateMetaAdRun({
        client,
        run: activating,
        status: "FAILED",
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Meta activation failed",
        expectedStatuses: ["ACTIVATING"],
      });
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
