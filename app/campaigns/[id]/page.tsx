import { notFound, redirect } from "next/navigation";
import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";
import { getCampaignRepository } from "@/lib/demo/repository";
import { getCampaignAnalytics } from "@/lib/analytics/campaignAnalytics";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignRepository = await getCampaignRepository("owner");
  const lifecycle = await campaignRepository.getLifecycle(id);
  if (!lifecycle) notFound();
  if (lifecycle.status !== "COMPLETED") redirect(`/campaigns/${encodeURIComponent(id)}/progress`);
  const published = await campaignRepository.getById(id);
  if (!published) notFound();
  const initialSummary = await campaignRepository.getReservationSummary(published.id);
  const initialAnalytics = await getCampaignAnalytics({
    campaignId: published.id,
    reservations: initialSummary.total,
  });

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport
        campaignId={published.id}
        publicSlug={published.slug}
        initialSummary={initialSummary}
        initialAnalytics={initialAnalytics}
      />
    </div>
  );
}
