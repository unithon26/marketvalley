import type { CampaignResponse } from "@/lib/contracts/api";
import type { CampaignRepository, PublishedCampaign } from "@/lib/contracts/repository";

export async function toCampaignResponse(
  campaign: PublishedCampaign,
  requestUrl: string,
  repository: CampaignRepository,
): Promise<CampaignResponse> {
  return {
    ...campaign,
    url: new URL(`/p/${campaign.slug}`, requestUrl).toString(),
    summary: await repository.getReservationSummary(campaign.id),
  };
}
