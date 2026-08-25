import {
  AuthenticationRequiredError,
  requireVerifiedIdentity,
} from "@/lib/auth/authorization";
import { getOptionalSupabaseConfig } from "@/lib/supabase/config";

export type CampaignEntryGateResult =
  | "allow"
  | "authentication_required"
  | "auth_not_configured"
  | "session_unavailable";

type CampaignEntryGateDependencies = {
  hasConfiguration: () => boolean;
  requireIdentity: () => Promise<unknown>;
};

const defaultDependencies: CampaignEntryGateDependencies = {
  hasConfiguration: () => getOptionalSupabaseConfig() !== null,
  requireIdentity: requireVerifiedIdentity,
};

export async function resolveCampaignEntryGate(
  dependencies: CampaignEntryGateDependencies = defaultDependencies,
): Promise<CampaignEntryGateResult> {
  let configured = false;
  try {
    configured = dependencies.hasConfiguration();
  } catch {
    return "auth_not_configured";
  }

  if (!configured) return "allow";

  try {
    await dependencies.requireIdentity();
    return "allow";
  } catch (error) {
    return error instanceof AuthenticationRequiredError
      ? "authentication_required"
      : "session_unavailable";
  }
}
