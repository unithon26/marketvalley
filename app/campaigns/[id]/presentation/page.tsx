import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";
import { getCampaignRepository } from "@/lib/demo/repository";
import { createPresentationReportSnapshot } from "@/lib/presentation/reportSnapshot";

export const metadata: Metadata = {
  title: "발표용 수집 완료 예시 | marketValley",
  robots: { index: false, follow: false },
};

export default async function PresentationCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignRepository = await getCampaignRepository("owner");
  const published = await campaignRepository.getById(id);
  if (!published) notFound();

  const snapshot = createPresentationReportSnapshot(published.id, published.publishedAt);

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport
        campaignId={published.id}
        publicSlug={published.slug}
        initialSpec={published.spec}
        initialSummary={snapshot.summary}
        initialAnalytics={snapshot.analytics}
        initialNextAction="continue"
        metaAdsEnabled={false}
        presentationMode={{ collectedHours: snapshot.collectedHours }}
      />
    </div>
  );
}
