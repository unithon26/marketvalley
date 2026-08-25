import { campaignIdQuerySchema } from "@/lib/contracts/api";
import { getCampaignRepository } from "@/lib/demo/repository";
import { toCampaignLifecycleResponse } from "@/app/api/_lib/campaign-lifecycle-response";
import { jsonResponse, routeErrorResponse } from "@/app/api/_lib/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const repository = await getCampaignRepository("owner");
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (rawId === null) {
      const campaigns = await repository.listLifecycle();
      return jsonResponse({ campaigns: campaigns.map(toCampaignLifecycleResponse) });
    }
    const { id } = campaignIdQuerySchema.parse({ id: rawId });
    const campaign = await repository.getLifecycle(id);
    if (!campaign) {
      return jsonResponse(
        { error: { code: "campaign_not_found", message: "광고를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return jsonResponse(toCampaignLifecycleResponse(campaign));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
