import { z } from "zod";

import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";
import { recordCampaignVisit } from "@/lib/analytics/campaignAnalytics";
import { isSameOriginMutation, resolveAppOrigin } from "@/lib/auth/security";

export const runtime = "nodejs";

const requestSchema = z.object({
  campaignId: z.string().uuid(),
  visitorId: z.string().uuid(),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const origin = resolveAppOrigin(request.url);
    if (!isSameOriginMutation(request, origin)) {
      return jsonResponse(
        { error: { code: "invalid_origin", message: "허용되지 않은 방문 기록 요청입니다." } },
        { status: 403 },
      );
    }
    const input = requestSchema.parse(await readJsonBody(request, 2_048));
    const recorded = await recordCampaignVisit(input);
    return jsonResponse({ recorded }, { status: recorded ? 201 : 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
