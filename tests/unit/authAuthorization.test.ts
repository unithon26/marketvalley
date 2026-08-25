import {
  AuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  AuthenticationRequiredError,
  requireVerifiedIdentity,
} from "@/lib/auth/authorization";

function clientWithClaims(result: unknown): SupabaseClient {
  return {
    auth: {
      getClaims: async () => result,
    },
  } as unknown as SupabaseClient;
}

describe("requireVerifiedIdentity", () => {
  it("검증된 JWT claims의 sub만 소유권 식별자로 사용한다", async () => {
    await expect(
      requireVerifiedIdentity(
        clientWithClaims({
          data: { claims: { sub: "user-1", email: "owner@example.com" } },
          error: null,
        }),
      ),
    ).resolves.toEqual({ userId: "user-1", email: "owner@example.com" });
  });

  it("검증 오류나 subject 없는 세션은 거절한다", async () => {
    await expect(
      requireVerifiedIdentity(clientWithClaims({ data: null, error: new Error("invalid JWT") })),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      requireVerifiedIdentity(clientWithClaims({ data: { claims: {} }, error: null })),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("Supabase/JWKS 일시 장애는 로그인 필요 상태로 숨기지 않는다", async () => {
    const unavailable = new AuthRetryableFetchError("service unavailable", 503);

    await expect(
      requireVerifiedIdentity(clientWithClaims({ data: null, error: unavailable })),
    ).rejects.toBe(unavailable);
  });
});
