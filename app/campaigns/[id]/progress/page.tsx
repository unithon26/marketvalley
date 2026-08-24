import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { SiteHeader } from "@/components/site-header";
import { campaignRepository } from "@/lib/demo/repository";

export default async function CampaignProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const published = await campaignRepository.getById(id);
  if (!published) notFound();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <ProgressView campaignId={published.id} />
    </div>
  );
}
