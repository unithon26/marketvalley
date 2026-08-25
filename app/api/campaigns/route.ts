import { after } from "next/server";

import {
  campaignIdQuerySchema,
  deleteCampaignRequestSchema,
  publishCampaignRequestSchema,
  startCampaignRequestSchema,
  updateCampaignRequestSchema,
} from "@/lib/contracts/api";
import { createCampaignGenerator } from "@/lib/ai/campaignGenerator";
import { isSameOriginMutation, resolveAppOrigin } from "@/lib/auth/security";
import { getCampaignRepository } from "@/lib/demo/repository";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { processCampaignLifecycle } from "@/lib/lifecycle/campaignLifecycleProcessor";
import {
  ApiRequestError,
  jsonResponse,
  readJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";
import { toCampaignResponse } from "@/app/api/_lib/campaign-response";
import { toCampaignLifecycleResponse } from "@/app/api/_lib/campaign-lifecycle-response";

export const runtime = "nodejs";
export const maxDuration = 300;

function requireSameOriginJson(request: Request): void {
  requireSameOrigin(request);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "unsupported_media_type", "JSON 요청만 허용합니다.");
  }
}

function requireSameOrigin(request: Request): void {
  if (!isSameOriginMutation(request, resolveAppOrigin(request.url))) {
    throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 광고 요청입니다.");
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const campaignRepository = await getCampaignRepository("owner");
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (rawId === null) {
      const campaigns = await campaignRepository.listLifecycle();
      return jsonResponse({ campaigns: campaigns.map(toCampaignLifecycleResponse) });
    }
    const { id } = campaignIdQuerySchema.parse({ id: rawId });
    const campaign = await campaignRepository.getById(id);
    if (!campaign) {
      return jsonResponse(
        { error: { code: "campaign_not_found", message: "광고를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return jsonResponse(await toCampaignResponse(campaign, request.url, campaignRepository));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOriginJson(request);
    const campaignRepository = await getCampaignRepository("owner");
    const body = await readJsonBody(request, 8_192);
    const startInput = startCampaignRequestSchema.safeParse(body);
    if (startInput.success) {
      const lifecycle = await campaignRepository.createSubmission(
        startInput.data.draftId,
        startInput.data.input,
      );
      if (resolveCampaignRepositoryMode() === "fixture") {
        const spec = await createCampaignGenerator().generate(startInput.data.input);
        await campaignRepository.publish(startInput.data.draftId, spec);
        const completed = await campaignRepository.getLifecycle(lifecycle.id);
        if (!completed) throw new Error("fixture campaign lifecycle missing");
        return jsonResponse(toCampaignLifecycleResponse(completed), { status: 201 });
      }

      after(async () => {
        try {
          await processCampaignLifecycle({ campaignId: lifecycle.id, maximumSteps: 5 });
        } catch (error) {
          console.error("campaign lifecycle dispatch failed", {
            campaignId: lifecycle.id,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      });
      return jsonResponse(toCampaignLifecycleResponse(lifecycle), { status: 202 });
    }

    if (resolveCampaignRepositoryMode() !== "fixture") {
      throw new ApiRequestError(
        400,
        "campaign_submission_required",
        "아이디어 입력을 먼저 접수해주세요.",
      );
    }
    const { draftId, spec } = publishCampaignRequestSchema.parse(body);
    const campaign = await campaignRepository.publish(draftId, spec);
    return jsonResponse(await toCampaignResponse(campaign, request.url, campaignRepository), { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireSameOriginJson(request);
    const campaignRepository = await getCampaignRepository("owner");
    const input = updateCampaignRequestSchema.parse(await readJsonBody(request, 8_192));
    const nextAction = await campaignRepository.saveNextAction(input);
    return jsonResponse({ campaignId: input.campaignId, nextAction });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const campaignRepository = await getCampaignRepository("owner");
    const url = new URL(request.url);
    const queryInput = {
      campaignId: url.searchParams.get("id"),
      draftId: url.searchParams.get("draftId"),
    };
    const input = deleteCampaignRequestSchema.parse(queryInput);
    await campaignRepository.delete(input);
    return jsonResponse({ deleted: true, campaignId: input.campaignId });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
