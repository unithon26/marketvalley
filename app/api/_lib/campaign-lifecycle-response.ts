import type { CampaignLifecycleResponse } from "@/lib/contracts/api";
import type { CampaignLifecycleRecord } from "@/lib/contracts/repository";

export function toCampaignLifecycleResponse(
  campaign: CampaignLifecycleRecord,
): CampaignLifecycleResponse {
  return {
    ...campaign,
    progressUrl: `/campaigns/${encodeURIComponent(campaign.id)}/progress`,
    reportUrl: campaign.status === "COMPLETED"
      ? `/campaigns/${encodeURIComponent(campaign.id)}`
      : null,
    landingUrl: campaign.slug ? `/p/${encodeURIComponent(campaign.slug)}` : null,
  };
}
