import "server-only";

import { z } from "zod";

import { CampaignDeletionBlockedError } from "@/lib/contracts/repository";
import { createGraphMetaAdsProviderFromEnvironment } from "@/lib/meta/metaConfig";
import type { MetaRunProvider } from "@/lib/meta/metaRunLifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

type Environment = Record<string, string | undefined>;

const deletionRunSchema = z.object({
  status: z.string(),
  meta_campaign_id: z.string().regex(/^\d{5,32}$/u),
  meta_ad_set_id: z.string().regex(/^\d{5,32}$/u),
  meta_ad_id: z.string().regex(/^\d{5,32}$/u),
}).strict();

export type CampaignDeletionMetaRun = z.infer<typeof deletionRunSchema>;

export async function assertMetaRunsPausedForDeletion(
  runs: readonly CampaignDeletionMetaRun[],
  provider: Pick<MetaRunProvider, "getObjectStatus">,
): Promise<void> {
  if (runs.some((run) => run.status !== "PAUSED")) {
    throw new CampaignDeletionBlockedError("live_ad");
  }

  try {
    const statuses = await Promise.all(runs.flatMap((run) => [
      provider.getObjectStatus(run.meta_campaign_id),
      provider.getObjectStatus(run.meta_ad_set_id),
      provider.getObjectStatus(run.meta_ad_id),
    ]));
    if (statuses.some((status) => (
      status.configuredStatus !== "PAUSED" || status.effectiveStatus === "ACTIVE"
    ))) {
      throw new CampaignDeletionBlockedError("live_ad");
    }
  } catch (error) {
    if (error instanceof CampaignDeletionBlockedError) throw error;
    throw new CampaignDeletionBlockedError("external_state_unknown");
  }
}

export async function assertCampaignMetaDeletionSafe(
  campaignId: string,
  environment: Environment = process.env,
): Promise<void> {
  const client = createSupabaseServiceClient(environment);
  const { data, error } = await client
    .from("meta_ad_runs")
    .select("status, meta_campaign_id, meta_ad_set_id, meta_ad_id")
    .eq("campaign_id", campaignId);
  if (error) throw new CampaignDeletionBlockedError("external_state_unknown");

  const parsed = z.array(deletionRunSchema).safeParse(data ?? []);
  if (!parsed.success) throw new CampaignDeletionBlockedError("external_state_unknown");
  if (parsed.data.length === 0) return;

  await assertMetaRunsPausedForDeletion(
    parsed.data,
    createGraphMetaAdsProviderFromEnvironment(environment),
  );
}
