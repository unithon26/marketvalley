import { carouselCoverAssets } from "@/components/renderers/carousel-card";
import { routeErrorResponse } from "@/app/api/_lib/http";
import { getCampaignRepository } from "@/lib/demo/repository";
import { recordingCampaignSlug } from "@/lib/presentation/recordingCampaign";
import { renderCarouselImageResponse } from "@/lib/rendering/carouselImage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ index: string }> },
): Promise<Response> {
  try {
    const { index: rawIndex } = await params;
    if (!/^[1-5]$/u.test(rawIndex)) return new Response(null, { status: 404 });

    const repository = await getCampaignRepository("public");
    const campaign = await repository.getBySlug(recordingCampaignSlug);
    if (!campaign) return new Response(null, { status: 404 });

    const coverPath = carouselCoverAssets[campaign.spec.templates.carouselCover];
    const coverDataUrl = coverPath ? new URL(coverPath, request.url).toString() : null;
    return renderCarouselImageResponse(campaign.spec, Number(rawIndex) - 1, { coverDataUrl });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
