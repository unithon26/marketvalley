import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";
import { getCampaignRepository } from "@/lib/demo/repository";
import {
  recordingCampaignSlug,
  recordingCardBasePath,
} from "@/lib/presentation/recordingCampaign";
import { createPresentationReportSnapshot } from "@/lib/presentation/reportSnapshot";

export const metadata: Metadata = {
  title: "발표용 수집 완료 예시 | marketValley",
  robots: { index: false, follow: false },
};

export default async function PublicPresentationReportPage() {
  await connection();
  const campaignRepository = await getCampaignRepository("public");
  const published = await campaignRepository.getBySlug(recordingCampaignSlug);
  if (!published) notFound();

  const snapshot = createPresentationReportSnapshot(published.id, published.publishedAt);

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport
        campaignId={published.id}
        publicSlug={published.slug}
        initialSummary={snapshot.summary}
        initialAnalytics={snapshot.analytics}
        presentationMode={{ collectedHours: snapshot.collectedHours }}
        cardImageBasePath={recordingCardBasePath}
      />
    </div>
  );
}
