import { CampaignWizard } from "@/components/campaign-wizard";
import { SiteHeader } from "@/components/site-header";

export default function NewCampaignPage() {
  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignWizard />
    </div>
  );
}
