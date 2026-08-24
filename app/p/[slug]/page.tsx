import { notFound } from "next/navigation";
import { PublicLanding } from "@/components/renderers/public-landing";
import { campaignRepository } from "@/lib/demo/repository";

export default async function PublicCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const published = await campaignRepository.getBySlug(slug);
  if (!published) notFound();
  return <PublicLanding spec={published.spec} campaignId={published.id} />;
}
