import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MetaAccountReadiness,
  MetaInsights,
  MetaObjectStatus,
} from "@/lib/meta/graphMetaAdsProvider";
import {
  storeMetaInsightSnapshot,
  updateMetaAdRun,
  type MetaAdRun,
} from "@/lib/meta/metaAdRun";

export type MetaRunProvider = {
  getAccountReadiness(): Promise<MetaAccountReadiness>;
  getObjectStatus(objectId: string): Promise<MetaObjectStatus>;
  getInsights(options: { objectId: string; startsAt: string; endsAt: string }): Promise<MetaInsights>;
  setObjectStatus(objectId: string, status: "ACTIVE" | "PAUSED"): Promise<void>;
};

export class MetaActivationReconciliationRequiredError extends Error {
  constructor() {
    super("Meta 활성화 실패 후 PAUSED 상태를 확인하지 못했습니다.");
    this.name = "MetaActivationReconciliationRequiredError";
  }
}

export async function getMetaRunObjectStatuses(
  provider: MetaRunProvider,
  run: MetaAdRun,
): Promise<{ campaign: MetaObjectStatus; adSet: MetaObjectStatus; ad: MetaObjectStatus }> {
  const [campaign, adSet, ad] = await Promise.all([
    provider.getObjectStatus(run.metaCampaignId),
    provider.getObjectStatus(run.metaAdSetId),
    provider.getObjectStatus(run.metaAdId),
  ]);
  return { campaign, adSet, ad };
}

export async function pauseMetaRunObjects(
  provider: MetaRunProvider,
  run: MetaAdRun,
): Promise<void> {
  const failures: unknown[] = [];
  // Stop delivery from the broadest object first, then close every child as a
  // defense in depth. Each call is attempted even if another one fails.
  for (const id of [run.metaCampaignId, run.metaAdSetId, run.metaAdId]) {
    try {
      await provider.setObjectStatus(id, "PAUSED");
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw new Error("Meta 광고 전체 중지에 실패했습니다.");
  const statuses = await getMetaRunObjectStatuses(provider, run);
  if (Object.values(statuses).some((status) => status.configuredStatus !== "PAUSED")) {
    throw new Error("Meta 광고가 PAUSED 상태로 확인되지 않았습니다.");
  }
}

export async function activateMetaRun(options: {
  client: SupabaseClient;
  provider: MetaRunProvider;
  run: MetaAdRun;
  approvedBy: string;
}): Promise<MetaAdRun> {
  const readiness = await options.provider.getAccountReadiness();
  if (
    readiness.adAccountId !== options.run.adAccountId
    || readiness.accountStatus !== 1
    || readiness.disableReason !== 0
    || readiness.currency !== "KRW"
    || !readiness.hasFundingSource
  ) {
    throw new Error("Meta 광고계정이 실제 집행 가능한 상태가 아닙니다.");
  }

  const activating = await updateMetaAdRun({
    client: options.client,
    run: options.run,
    status: "ACTIVATING",
    approvedBy: options.approvedBy,
    expectedStatuses: ["PAUSED", "FAILED"],
  });
  try {
    // Activate children before the parent so delivery cannot begin with an
    // incompletely configured creative tree.
    await options.provider.setObjectStatus(activating.metaAdId, "ACTIVE");
    await options.provider.setObjectStatus(activating.metaAdSetId, "ACTIVE");
    await options.provider.setObjectStatus(activating.metaCampaignId, "ACTIVE");
    // Graph status reads can lag behind successful status writes. Keep the run
    // in ACTIVATING and let the lifecycle poll confirm it on the next pass.
    return activating;
  } catch (error) {
    let pauseVerified = true;
    try {
      await pauseMetaRunObjects(options.provider, activating);
    } catch {
      pauseVerified = false;
    }
    await updateMetaAdRun({
      client: options.client,
      run: activating,
      status: "FAILED",
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Meta activation failed",
      expectedStatuses: ["ACTIVATING"],
    });
    if (!pauseVerified) throw new MetaActivationReconciliationRequiredError();
    throw error;
  }
}

export async function pauseMetaRun(options: {
  client: SupabaseClient;
  provider: MetaRunProvider;
  run: MetaAdRun;
}): Promise<MetaAdRun> {
  const pausing = await updateMetaAdRun({
    client: options.client,
    run: options.run,
    status: "PAUSING",
    expectedStatuses: ["ACTIVE", "ACTIVATING", "FAILED", "PAUSED"],
  });
  await pauseMetaRunObjects(options.provider, pausing);
  return updateMetaAdRun({
    client: options.client,
    run: pausing,
    status: "PAUSED",
    paused: true,
    expectedStatuses: ["PAUSING"],
  });
}

export async function collectMetaInsight(options: {
  client: SupabaseClient;
  provider: MetaRunProvider;
  run: MetaAdRun;
  final: boolean;
}): Promise<MetaInsights> {
  const insight = await options.provider.getInsights({
    objectId: options.run.metaCampaignId,
    startsAt: options.run.startsAt,
    endsAt: options.run.endsAt,
  });
  await storeMetaInsightSnapshot({
    client: options.client,
    run: options.run,
    insight,
    final: options.final,
  });
  return insight;
}
