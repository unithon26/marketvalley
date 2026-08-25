import type { CampaignResponse } from "@/lib/contracts/api";
import type { CampaignRepository, PublishedCampaign } from "@/lib/contracts/repository";
import { getCampaignAnalytics } from "@/lib/analytics/campaignAnalytics";

export async function toCampaignResponse(
  campaign: PublishedCampaign,
  requestUrl: string,
  repository: CampaignRepository,
): Promise<CampaignResponse> {
  const summary = await repository.getReservationSummary(campaign.id);
  return {
    ...campaign,
    url: new URL(`/p/${campaign.slug}`, requestUrl).toString(),
    summary,
    analytics: await getCampaignAnalytics({
      campaignId: campaign.id,
      reservations: summary.total,
    }),
  };
}
