import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { SiteHeader } from "@/components/site-header";
import { getCampaignRepository } from "@/lib/demo/repository";
import { toCampaignLifecycleResponse } from "@/app/api/_lib/campaign-lifecycle-response";

export default async function CampaignProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignRepository = await getCampaignRepository("owner");
  const campaign = await campaignRepository.getLifecycle(id);
  if (!campaign) notFound();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <ProgressView initialCampaign={toCampaignLifecycleResponse(campaign)} />
    </div>
  );
}
