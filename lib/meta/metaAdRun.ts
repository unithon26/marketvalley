import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MetaOperationResult } from "@/lib/meta/operationLedger";
import type { MetaPausedDraftServerPolicy } from "@/lib/meta/metaConfig";

export type MetaAdRunStatus = "PAUSED" | "ACTIVATING" | "ACTIVE" | "PAUSING" | "FAILED";

export type MetaAdRun = {
  id: string;
  operationKey: string;
  ownerId: string;
  campaignId: string;
  adAccountId: string;
  metaCampaignId: string;
  metaAdSetId: string;
  metaCreativeId: string;
  metaAdId: string;
  lifetimeBudgetMinor: number;
  startsAt: string;
  endsAt: string;
  status: MetaAdRunStatus;
  approvedAt: string | null;
  pausedAt: string | null;
  lastError: string | null;
};

const columns = "id, operation_key, owner_id, campaign_id, ad_account_id, meta_campaign_id, meta_ad_set_id, meta_creative_id, meta_ad_id, lifetime_budget_minor, starts_at, ends_at, status, approved_at, paused_at, last_error";

function toRun(value: unknown): MetaAdRun {
  const row = value as Record<string, unknown>;
  if (!row || typeof row !== "object") throw new Error("Meta ad run response invalid");
  return {
    id: String(row.id),
    operationKey: String(row.operation_key),
    ownerId: String(row.owner_id),
    campaignId: String(row.campaign_id),
    adAccountId: String(row.ad_account_id),
    metaCampaignId: String(row.meta_campaign_id),
    metaAdSetId: String(row.meta_ad_set_id),
    metaCreativeId: String(row.meta_creative_id),
    metaAdId: String(row.meta_ad_id),
    lifetimeBudgetMinor: Number(row.lifetime_budget_minor),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    status: String(row.status) as MetaAdRunStatus,
    approvedAt: row.approved_at === null ? null : String(row.approved_at),
    pausedAt: row.paused_at === null ? null : String(row.paused_at),
    lastError: row.last_error === null ? null : String(row.last_error),
  };
}

export async function registerMetaAdRun(options: {
  client: SupabaseClient;
  ownerId: string;
  campaignId: string;
  adAccountId: string;
  policy: MetaPausedDraftServerPolicy;
  result: MetaOperationResult;
}): Promise<MetaAdRun> {
  const existing = await options.client
    .from("meta_ad_runs")
    .select(columns)
    .eq("operation_key", options.result.operationKey)
    .maybeSingle();
  if (existing.error) throw new Error("Meta ad run lookup failed");
  if (existing.data) {
    const run = toRun(existing.data);
    if (
      run.ownerId !== options.ownerId || run.campaignId !== options.campaignId ||
      run.adAccountId !== options.adAccountId || run.metaCampaignId !== options.result.campaignId ||
      run.metaAdSetId !== options.result.adSetId || run.metaCreativeId !== options.result.creativeId ||
      run.metaAdId !== options.result.adId
    ) throw new Error("Meta ad run conflict");
    return run;
  }
  const { data, error } = await options.client
    .from("meta_ad_runs")
    .insert({
      operation_key: options.result.operationKey,
      owner_id: options.ownerId,
      campaign_id: options.campaignId,
      ad_account_id: options.adAccountId,
      meta_campaign_id: options.result.campaignId,
      meta_ad_set_id: options.result.adSetId,
      meta_creative_id: options.result.creativeId,
      meta_ad_id: options.result.adId,
      lifetime_budget_minor: options.policy.lifetimeBudgetMinor,
      starts_at: options.policy.startsAt,
      ends_at: options.policy.endsAt,
      status: "PAUSED",
    })
    .select(columns)
    .single();
  if (error || !data) throw new Error("Meta ad run registration failed");
  return toRun(data);
}

export async function getLatestMetaAdRun(options: {
  client: SupabaseClient;
  ownerId: string;
  campaignId: string;
}): Promise<MetaAdRun | null> {
  const { data, error } = await options.client
    .from("meta_ad_runs")
    .select(columns)
    .eq("owner_id", options.ownerId)
    .eq("campaign_id", options.campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Meta ad run lookup failed");
  return data ? toRun(data) : null;
}

export async function hasOtherLiveMetaAdRun(options: {
  client: SupabaseClient;
  adAccountId: string;
  runId: string;
}): Promise<boolean> {
  const { count, error } = await options.client
    .from("meta_ad_runs")
    .select("id", { count: "exact", head: true })
    .eq("ad_account_id", options.adAccountId)
    .neq("id", options.runId)
    .in("status", ["ACTIVATING", "ACTIVE", "PAUSING"]);
  if (error) throw new Error("Meta live run lookup failed");
  return (count ?? 0) > 0;
}

export async function updateMetaAdRun(options: {
  client: SupabaseClient;
  run: MetaAdRun;
  status: MetaAdRunStatus;
  approvedBy?: string;
  paused?: boolean;
  lastError?: string | null;
  expectedStatuses?: readonly MetaAdRunStatus[];
}): Promise<MetaAdRun> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: options.status,
    updated_at: now,
    last_error: options.lastError ?? null,
  };
  if (options.approvedBy) {
    patch.approved_by = options.approvedBy;
    patch.approved_at = now;
  }
  if (options.paused) patch.paused_at = now;
  let query = options.client
    .from("meta_ad_runs")
    .update(patch)
    .eq("id", options.run.id)
    .eq("owner_id", options.run.ownerId);
  if (options.expectedStatuses?.length) query = query.in("status", [...options.expectedStatuses]);
  const { data, error } = await query
    .select(columns)
    .maybeSingle();
  if (error || !data) throw new Error("Meta ad run update failed");
  return toRun(data);
}

export async function storeMetaInsightSnapshot(options: {
  client: SupabaseClient;
  run: MetaAdRun;
  insight: {
    impressions: number;
    reach: number;
    clicks: number;
    linkClicks: number;
    spendMinor: number;
    currency: string;
    dateStart: string;
    dateStop: string;
  };
  final: boolean;
}): Promise<void> {
  const { error } = await options.client.from("meta_insight_snapshots").insert({
    run_id: options.run.id,
    impressions: options.insight.impressions,
    reach: options.insight.reach,
    clicks: options.insight.clicks,
    link_clicks: options.insight.linkClicks,
    spend_minor: options.insight.spendMinor,
    currency: options.insight.currency,
    date_start: options.insight.dateStart,
    date_stop: options.insight.dateStop,
    is_final: options.final,
  });
  if (error) throw new Error("Meta insight snapshot storage failed");
}
