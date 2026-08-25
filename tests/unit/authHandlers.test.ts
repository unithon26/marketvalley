import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  handleAuthCallback,
  handleGoogleSignIn,
  handleLogout,
  handleSession,
} from "@/lib/auth/handlers";
import type { AuthContinuationStore } from "@/lib/auth/continuation";

const environment = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example",
};

function clientWithAuth(auth: Record<string, unknown>): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

function continuationStore(values = new Map<string, string>()): AuthContinuationStore {
  return {
    set(flowId, nextPath) {
      values.set(flowId, nextPath);
    },
    take(flowId) {
      const value = values.get(flowId) ?? null;
      values.delete(flowId);
      return value;
    },
  };
}

function user(): User {
  return {
    id: "user-1",
    email: "owner@example.com",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "홍성주" },
    aud: "authenticated",
    created_at: "2026-08-25T00:00:00.000Z",
  };
}

describe("auth route handlers", () => {
  it("Google OAuth를 서버 PKCE callback으로 시작한다", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: {
        url: "https://project.supabase.co/auth/v1/authorize?provider=google",
        flowId: "flow_aaaa",
      },
      error: null,
    });
    const continuations = continuationStore();
    const response = await handleGoogleSignIn(
      new Request("https://marketvalley.example/auth/google?next=%2Fcampaigns%2Fdemo"),
      {
        environment,
        createClient: async () => clientWithAuth({ signInWithOAuth }),
        continuations,
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("project.supabase.co/auth/v1/authorize");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://marketvalley.example/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(continuations.take("flow_aaaa")).toBe("/campaigns/demo");
  });

  it("외부 next URL은 로그인 뒤 홈으로 제한한다", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://project.supabase.co/authorize", flowId: "flow_bbbb" },
      error: null,
    });
    const continuations = continuationStore();
    await handleGoogleSignIn(
      new Request("https://marketvalley.example/auth/google?next=https://attacker.example"),
      {
        environment,
        createClient: async () => clientWithAuth({ signInWithOAuth }),
        continuations,
      },
    );

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        redirectTo: "https://marketvalley.example/auth/callback",
      }),
    }));
    expect(continuations.take("flow_bbbb")).toBe("/");
  });

  it("callback code를 세션으로 교환한 뒤 내부 next 경로로 이동한다", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const response = await handleAuthCallback(
      new Request(
        "https://marketvalley.example/auth/callback?code=one-time-code&sb_flow_id=flow_cccc",
      ),
      {
        environment,
        createClient: async () => clientWithAuth({ exchangeCodeForSession }),
        continuations: continuationStore(new Map([["flow_cccc", "/campaigns/demo"]])),
      },
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code", {
      flowId: "flow_cccc",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://marketvalley.example/campaigns/demo",
    );
  });

  it("provider 거절과 잘못된 callback을 일반화된 오류 코드로 보낸다", async () => {
    const providerDenied = await handleAuthCallback(
      new Request("https://marketvalley.example/auth/callback?error=access_denied"),
      {
        environment,
        createClient: async () => clientWithAuth({}),
        continuations: continuationStore(),
      },
    );
    const missingCode = await handleAuthCallback(
      new Request("https://marketvalley.example/auth/callback"),
      {
        environment,
        createClient: async () => clientWithAuth({}),
        continuations: continuationStore(),
      },
    );

    expect(providerDenied.headers.get("location")).toBe(
      "https://marketvalley.example/auth/error?code=provider_denied",
    );
    expect(missingCode.headers.get("location")).toBe(
      "https://marketvalley.example/auth/error?code=invalid_request",
    );
  });

  it("동시에 시작한 PKCE callback을 역순으로 받아도 각 verifier와 next를 유지한다", async () => {
    const values = new Map<string, string>();
    const continuations = continuationStore(values);
    const signInWithOAuth = vi
      .fn()
      .mockResolvedValueOnce({
        data: { url: "https://project.supabase.co/first", flowId: "flow_1111" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { url: "https://project.supabase.co/second", flowId: "flow_2222" },
        error: null,
      });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = clientWithAuth({ signInWithOAuth, exchangeCodeForSession });
    const createClient = async () => client;

    await handleGoogleSignIn(
      new Request("https://marketvalley.example/auth/google?next=%2Fcampaigns%2Ffirst"),
      { environment, createClient, continuations },
    );
    await handleGoogleSignIn(
      new Request("https://marketvalley.example/auth/google?next=%2Fcampaigns%2Fsecond"),
      { environment, createClient, continuations },
    );

    const second = await handleAuthCallback(
      new Request(
        "https://marketvalley.example/auth/callback?code=second-code&sb_flow_id=flow_2222",
      ),
      { environment, createClient, continuations },
    );
    const first = await handleAuthCallback(
      new Request(
        "https://marketvalley.example/auth/callback?code=first-code&sb_flow_id=flow_1111",
      ),
      { environment, createClient, continuations },
    );

    expect(second.headers.get("location")).toBe(
      "https://marketvalley.example/campaigns/second",
    );
    expect(first.headers.get("location")).toBe(
      "https://marketvalley.example/campaigns/first",
    );
    expect(exchangeCodeForSession.mock.calls).toEqual([
      ["second-code", { flowId: "flow_2222" }],
      ["first-code", { flowId: "flow_1111" }],
    ]);
  });

  it("검증된 사용자 정보만 session API에 노출한다", async () => {
    const response = await handleSession({
      createClient: async () =>
        clientWithAuth({ getUser: async () => ({ data: { user: user() }, error: null }) }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "홍성주",
        avatarUrl: null,
      },
    });
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("세션 없음은 정상 비로그인으로, Auth 장애는 503으로 구분한다", async () => {
    const missingSession = Object.assign(new Error("missing"), {
      name: "AuthSessionMissingError",
    });
    const anonymous = await handleSession({
      createClient: async () =>
        clientWithAuth({ getUser: async () => ({ data: { user: null }, error: missingSession }) }),
    });
    const outage = await handleSession({
      createClient: async () =>
        clientWithAuth({ getUser: async () => ({ data: { user: null }, error: new Error("down") }) }),
    });

    expect(anonymous.status).toBe(200);
    await expect(anonymous.json()).resolves.toEqual({ authenticated: false, user: null });
    expect(outage.status).toBe(503);
    await expect(outage.json()).resolves.toMatchObject({
      error: { code: "session_unavailable" },
    });
  });

  it("로그아웃은 same-origin POST에서 현재 세션만 종료한다", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const response = await handleLogout(
      new Request("https://marketvalley.example/auth/logout?next=%2F", {
        method: "POST",
        headers: { Origin: "https://marketvalley.example" },
      }),
      {
        environment,
        createClient: async () =>
          clientWithAuth({
            signOut,
          }),
      },
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://marketvalley.example/");
  });

  it("검증할 수 없는 세션도 local signOut을 실행하고 실패를 성공으로 표시하지 않는다", async () => {
    const failedSignOut = await handleLogout(
      new Request("https://marketvalley.example/auth/logout", {
        method: "POST",
        headers: { Origin: "https://marketvalley.example" },
      }),
      {
        environment,
        createClient: async () =>
          clientWithAuth({
            signOut: async () => ({ error: new Error("auth unavailable") }),
          }),
      },
    );

    expect(failedSignOut.status).toBe(302);
    expect(failedSignOut.headers.get("location")).toBe(
      "https://marketvalley.example/auth/error?code=logout_failed",
    );
  });

  it("교차 origin 로그아웃은 Supabase 호출 전에 거절한다", async () => {
    const createClient = vi.fn();
    const response = await handleLogout(
      new Request("https://marketvalley.example/auth/logout", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      }),
      { environment, createClient },
    );

    expect(response.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
});
