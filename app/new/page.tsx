import { connection } from "next/server";

import { CampaignWizard } from "@/components/campaign-wizard";
import { SiteHeader } from "@/components/site-header";
import { resolveCampaignGeneratorStatus } from "@/lib/ai/generatorConfig";

export default async function NewCampaignPage() {
  await connection();
  const generatorStatus = resolveCampaignGeneratorStatus();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignWizard generatorStatus={generatorStatus} />
    </div>
  );
}
