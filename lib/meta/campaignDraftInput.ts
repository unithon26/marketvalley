import "server-only";

import type { PublishedCampaign } from "@/lib/contracts/repository";
import { carouselFileNames } from "@/lib/contracts/carouselAssets";
import type { MetaPausedCarouselDraftInput, MetaPngAsset } from "@/lib/meta/contracts";
import type { MetaPausedDraftServerPolicy } from "@/lib/meta/metaConfig";

export function deriveMetaPausedDraftInput(options: {
  campaign: PublishedCampaign;
  images: readonly MetaPngAsset[];
  appOrigin: string;
  policy: MetaPausedDraftServerPolicy;
}): MetaPausedCarouselDraftInput {
  const { campaign, images, policy } = options;
  const destinationUrl = new URL(
    `/p/${encodeURIComponent(campaign.slug)}`,
    options.appOrigin,
  );
  destinationUrl.searchParams.set("utm_source", "meta");
  destinationUrl.searchParams.set("utm_medium", "paid_social");
  destinationUrl.searchParams.set("utm_campaign", campaign.id);
  const spec = campaign.spec;
  const cards = [
    { headline: spec.messaging.hooks[0], description: spec.carousel.hookBody },
    { headline: spec.carousel.problem.headline, description: spec.carousel.problem.body },
    { headline: spec.carousel.insight.headline, description: spec.carousel.insight.body },
    { headline: spec.messaging.valueProposition, description: spec.carousel.solutionBody },
    { headline: spec.validation.signal.ctaLabel, description: spec.carousel.ctaBody },
  ] as const;

  return {
    sourceCampaignId: campaign.id,
    name: `${spec.project.name} 시장검증`,
    destinationUrl: destinationUrl.toString(),
    message: spec.messaging.caption,
    headline: spec.messaging.hooks[0],
    images: images.map((image, index) => ({
      ...image,
      filename: carouselFileNames[index],
    })),
    cards,
    targeting: policy.targeting,
    lifetimeBudgetMinor: policy.lifetimeBudgetMinor,
    startsAt: policy.startsAt,
    endsAt: policy.endsAt,
  };
}
