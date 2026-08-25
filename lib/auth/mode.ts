import { getOptionalSupabaseConfig, hasCompleteBundledSupabaseConfig } from "@/lib/supabase/config";

export type AuthMode = "disabled" | "mock" | "supabase";

type Environment = Record<string, string | undefined>;

export function resolveAuthMode(environment: Environment = process.env): AuthMode {
  if (environment.NEXT_PUBLIC_AUTH_MODE?.trim() === "mock") return "mock";
  return getOptionalSupabaseConfig(environment) ? "supabase" : "disabled";
}

export function hasBundledAuthMode(): boolean {
  return hasBundledPresentationAuthMode()
    || hasCompleteBundledSupabaseConfig();
}

export function hasBundledPresentationAuthMode(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "mock";
}
