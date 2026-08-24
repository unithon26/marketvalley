import {
  campaignIdQuerySchema,
  deleteCampaignRequestSchema,
  publishCampaignRequestSchema,
  updateCampaignRequestSchema,
  type CampaignResponse,
} from "@/lib/contracts/api";
import type { PublishedCampaign } from "@/lib/contracts/repository";
import { campaignRepository, fixtureCampaignRepository } from "@/lib/demo/repository";
import {
  jsonResponse,
  readJsonBody,
  readOptionalJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";

async function campaignResponse(
  campaign: PublishedCampaign,
  requestUrl: string,
): Promise<CampaignResponse> {
  return {
    ...campaign,
    url: new URL(`/p/${campaign.slug}`, requestUrl).toString(),
    summary: await campaignRepository.getSignalSummary(campaign.id),
  };
}

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
    return jsonResponse(await campaignResponse(campaign, request.url));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { draftId, spec } = publishCampaignRequestSchema.parse(await readJsonBody(request));
    const campaign = await campaignRepository.publish(draftId, spec);
    return jsonResponse(await campaignResponse(campaign, request.url), { status: 201 });
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
      const campaign = fixtureCampaignRepository.resetDemoState();
      return jsonResponse({ reset: true, campaignId: campaign.id });
    }
    const input = deleteCampaignRequestSchema.parse(body);
    await campaignRepository.delete(input);
    return jsonResponse({ deleted: true, campaignId: input.campaignId });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
