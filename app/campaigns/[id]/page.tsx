import { notFound } from "next/navigation";
import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";
import { campaignRepository } from "@/lib/demo/repository";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const published = await campaignRepository.getBySlug(id);
  if (!published) notFound();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport campaignId={published.id} initialSpec={published.spec} />
    </div>
  );
}
