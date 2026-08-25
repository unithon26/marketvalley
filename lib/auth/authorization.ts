import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";

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

  // JWKS/Auth 서비스 장애를 로그아웃 상태로 축약하면 사용자가 로그인만 반복하게 된다.
  // 만료·누락·위조 세션은 다시 로그인하면 해결되지만, 재시도 가능한 네트워크 오류는
  // 상위 경계가 일시 장애로 안내할 수 있도록 원래 오류를 보존한다.
  if (error) {
    if (isAuthRetryableFetchError(error)) throw error;
    throw new AuthenticationRequiredError();
  }
  if (!subject) throw new AuthenticationRequiredError();

  return {
    userId: subject,
    email: typeof data?.claims?.email === "string" ? data.claims.email : null,
  };
}
