import {
  campaignIdQuerySchema,
  deleteCampaignRequestSchema,
  publishCampaignRequestSchema,
  updateCampaignRequestSchema,
} from "@/lib/contracts/api";
import { campaignRepository } from "@/lib/demo/repository";
import { demoCampaignId } from "@/lib/demo/demo-campaign";
import {
  jsonResponse,
  readJsonBody,
  readOptionalJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";
import { toCampaignResponse } from "@/app/api/_lib/campaign-response";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const { id } = campaignIdQuerySchema.parse({ id: url.searchParams.get("id") });
    const campaign = await campaignRepository.getById(id);
    if (!campaign) {
      return jsonResponse(
        { error: { code: "campaign_not_found", message: "캠페인을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return jsonResponse(await toCampaignResponse(campaign, request.url));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { draftId, spec } = publishCampaignRequestSchema.parse(await readJsonBody(request));
    const campaign = await campaignRepository.publish(draftId, spec);
    return jsonResponse(await toCampaignResponse(campaign, request.url), { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const input = updateCampaignRequestSchema.parse(await readJsonBody(request, 8_192));
    const nextAction = await campaignRepository.saveNextAction(input);
    return jsonResponse({ campaignId: input.campaignId, nextAction });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const queryInput = {
      campaignId: url.searchParams.get("id"),
      draftId: url.searchParams.get("draftId"),
    };
    const hasQueryInput = queryInput.campaignId !== null || queryInput.draftId !== null;
    const body = hasQueryInput ? queryInput : await readOptionalJsonBody(request, 8_192);
    if (body === null) {
      const campaign = await campaignRepository.reset({
        campaignId: demoCampaignId,
        draftId: demoCampaignId,
      });
      return jsonResponse({ reset: true, campaignId: campaign.id });
    }
    const input = deleteCampaignRequestSchema.parse(body);
    await campaignRepository.delete(input);
    return jsonResponse({ deleted: true, campaignId: input.campaignId });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
