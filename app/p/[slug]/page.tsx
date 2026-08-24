import { notFound } from "next/navigation";
import { PublicLanding } from "@/components/renderers/public-landing";
import { demoCampaign, demoCampaignSlug } from "@/lib/demo/demo-campaign";

export default async function PublicCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== demoCampaignSlug) notFound();
  return <PublicLanding spec={demoCampaign} />;
}
