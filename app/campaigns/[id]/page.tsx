import { notFound } from "next/navigation";
import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "demo") notFound();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport />
    </div>
  );
}
