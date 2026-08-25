import { connection } from "next/server";
import { redirect } from "next/navigation";

import { CampaignWizard } from "@/components/campaign-wizard";
import { SiteHeader } from "@/components/site-header";
import { resolveCampaignGeneratorStatus } from "@/lib/ai/generatorConfig";
import { resolveCampaignEntryGate } from "@/lib/auth/campaignEntryGate";

export default async function NewCampaignPage() {
  await connection();
  const gate = await resolveCampaignEntryGate();
  if (gate !== "allow") {
    redirect(gate === "authentication_required"
      ? "/login?next=%2Fnew"
      : `/login?next=%2Fnew&error=${gate}`);
  }
  const generatorStatus = resolveCampaignGeneratorStatus();

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignWizard generatorStatus={generatorStatus} />
    </div>
  );
}
