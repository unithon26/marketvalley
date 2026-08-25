import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLanding } from "@/components/renderers/public-landing";
import { getCampaignRepository } from "@/lib/demo/repository";

type PublicCampaignPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PublicCampaignPageProps): Promise<Metadata> {
  const { slug } = await params;
  const campaignRepository = await getCampaignRepository("public");
  const published = await campaignRepository.getBySlug(slug);
  if (!published) return {};

  return {
    title: published.spec.landing.seoTitle,
    description: published.spec.landing.hero.supportingText,
  };
}

export default async function PublicCampaignPage({ params }: PublicCampaignPageProps) {
  const { slug } = await params;
  const campaignRepository = await getCampaignRepository("public");
  const published = await campaignRepository.getBySlug(slug);
  if (!published) notFound();
  return <PublicLanding spec={published.spec} campaignId={published.id} />;
}
