import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "AuthenticationRequiredError";
  }
}

export type VerifiedIdentity = {
  userId: string;
  email: string | null;
};

export async function requireVerifiedIdentity(
  client?: SupabaseClient,
): Promise<VerifiedIdentity> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.auth.getClaims();
  const subject = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (error || !subject) throw new AuthenticationRequiredError();

  return {
    userId: subject,
    email: typeof data?.claims?.email === "string" ? data.claims.email : null,
  };
}
