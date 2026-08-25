import { toCampaignResponse } from "@/app/api/_lib/campaign-response";
import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";
import { resetCampaignRequestSchema } from "@/lib/contracts/api";
import { getCampaignRepository } from "@/lib/demo/repository";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const campaignRepository = await getCampaignRepository("owner");
    const input = resetCampaignRequestSchema.parse(await readJsonBody(request, 8_192));
    const campaign = await campaignRepository.reset(input);
    return jsonResponse(await toCampaignResponse(campaign, request.url, campaignRepository));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
