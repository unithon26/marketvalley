import type { CampaignResponse } from "@/lib/contracts/api";
import type { PublishedCampaign } from "@/lib/contracts/repository";
import { campaignRepository } from "@/lib/demo/repository";

export async function toCampaignResponse(
  campaign: PublishedCampaign,
  requestUrl: string,
): Promise<CampaignResponse> {
  return {
    ...campaign,
    url: new URL(`/p/${campaign.slug}`, requestUrl).toString(),
    summary: await campaignRepository.getSignalSummary(campaign.id),
  };
}
