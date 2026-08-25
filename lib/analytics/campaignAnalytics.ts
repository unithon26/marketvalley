import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CampaignAnalytics } from "@/lib/contracts/analytics";
import { emptyCampaignAnalytics } from "@/lib/contracts/analytics";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

type Environment = Record<string, string | undefined>;

type InsightRow = {
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  spend_minor: number;
  currency: string;
  is_final: boolean;
  fetched_at: string;
};

function requiredSecret(environment: Environment): string {
  const secret = environment.SIGNAL_HASH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("campaign analytics hash secret unavailable");
  return secret;
}
export async function recordCampaignVisit(options: {
  campaignId: string;
  visitorId: string;
  environment?: Environment;
  client?: SupabaseClient;
  now?: Date;
}): Promise<boolean> {
  const environment = options.environment ?? process.env;
  if (resolveCampaignRepositoryMode(environment) !== "supabase") return false;
  if (!/^[0-9a-f-]{36}$/iu.test(options.visitorId)) throw new Error("invalid visitor id");
  const visitorHash = createHmac("sha256", requiredSecret(environment))
    .update(`${options.campaignId}:${options.visitorId}`)
    .digest("hex");
  const client = options.client ?? createSupabaseServiceClient(environment);
  const { data, error } = await client.rpc("record_campaign_visit", {
    p_campaign_id: options.campaignId,
    p_visitor_hash: visitorHash,
    p_visited_at: (options.now ?? new Date()).toISOString(),
  });
  if (error) throw new Error("campaign visit storage failed");
  return data === true;
}

export async function getCampaignAnalytics(options: {
  campaignId: string;
  reservations: number;
  environment?: Environment;
  client?: SupabaseClient;
}): Promise<CampaignAnalytics> {
  const environment = options.environment ?? process.env;
  if (resolveCampaignRepositoryMode(environment) !== "supabase") {
    return { ...emptyCampaignAnalytics, reservations: options.reservations };
  }
  const client = options.client ?? createSupabaseServiceClient(environment);
  const [{ count, error: visitError }, { data: runs, error: runError }] = await Promise.all([
    client
      .from("campaign_daily_visitors")
      .select("visitor_hash", { count: "exact", head: true })
      .eq("campaign_id", options.campaignId),
    client
      .from("meta_ad_runs")
      .select("id")
      .eq("campaign_id", options.campaignId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (visitError || runError) throw new Error("campaign analytics lookup failed");
  const landingVisits = count ?? 0;
  const runId = Array.isArray(runs) && runs[0] && typeof runs[0].id === "string"
    ? runs[0].id
    : null;
  if (!runId) {
    return { ...emptyCampaignAnalytics, landingVisits, reservations: options.reservations };
  }
  const { data, error } = await client
    .from("meta_insight_snapshots")
    .select("impressions, reach, clicks, link_clicks, spend_minor, currency, is_final, fetched_at")
    .eq("run_id", runId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Meta insight snapshot lookup failed");
  if (!data) {
    return {
      ...emptyCampaignAnalytics,
      status: "collecting",
      landingVisits,
      reservations: options.reservations,
    };
  }
  const row = data as InsightRow;
  return {
    status: row.is_final ? "final" : "preliminary",
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    linkClicks: row.link_clicks,
    spendMinor: row.spend_minor,
    currency: row.currency,
    landingVisits,
    reservations: options.reservations,
    updatedAt: row.fetched_at,
  };
}
