import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { SiteHeader } from "@/components/site-header";

export default async function CampaignProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "demo") notFound();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <ProgressView />
    </div>
  );
}
