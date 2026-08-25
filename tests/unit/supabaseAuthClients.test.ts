import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, cookiesMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { refreshSupabaseSession } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAuthContinuationStore } from "@/lib/auth/continuation";

describe("Supabase SSR clients", () => {
  beforeEach(() => {
    createServerClientMock.mockReset();
    cookiesMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Route Handler client가 HttpOnly 쿠키를 Next cookie store에 기록한다", async () => {
    const set = vi.fn();
    cookiesMock.mockResolvedValue({ getAll: () => [{ name: "existing", value: "one" }], set });
    createServerClientMock.mockReturnValue({ client: "server" });

    await expect(createSupabaseServerClient()).resolves.toEqual({ client: "server" });
    const options = createServerClientMock.mock.calls[0]?.[2];
    expect(options.auth).toEqual({
      experimental: { appendPkceFlowIdToRedirects: true },
    });
    expect(options.cookieOptions).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    expect(options.cookies.getAll()).toEqual([{ name: "existing", value: "one" }]);
    options.cookies.setAll([
      { name: "auth-cookie", value: "opaque", options: { sameSite: "lax" } },
    ]);
    expect(set).toHaveBeenCalledWith("auth-cookie", "opaque", { sameSite: "lax" });
  });

  it("동시 OAuth 흐름의 next 경로를 flow별 짧은 HttpOnly 쿠키로 보관한다", async () => {
    const values = new Map<string, string>();
    const set = vi.fn(
      (name: string, value: string, options: { maxAge: number }) => {
        if (options.maxAge === 0) values.delete(name);
        else values.set(name, value);
      },
    );
    cookiesMock.mockResolvedValue({
      get: (name: string) => {
        const value = values.get(name);
        return value ? { name, value } : undefined;
      },
      set,
    });
    const continuations = await createAuthContinuationStore();

    continuations.set("flow_1111", "/campaigns/first");
    continuations.set("flow_2222", "/campaigns/second");

    expect(continuations.take("flow_2222")).toBe("/campaigns/second");
    expect(continuations.take("flow_1111")).toBe("/campaigns/first");
    expect(set).toHaveBeenCalledWith(
      "mv-auth-next-flow_1111",
      "%2Fcampaigns%2Ffirst",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 600,
        path: "/auth/callback",
        sameSite: "lax",
      }),
    );
  });

  it("Proxy가 갱신 쿠키를 request와 response에 함께 반영하고 no-store를 유지한다", async () => {
    createServerClientMock.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (
              values: Array<{ name: string; value: string; options: Record<string, unknown> }>,
              headers: Record<string, string>,
            ) => void;
          };
        },
      ) => ({
        auth: {
          getClaims: async () => {
            options.cookies.setAll(
              [
                {
                  name: "sb-project-auth-token",
                  value: "opaque",
                  options: { httpOnly: true, sameSite: "lax", path: "/" },
                },
              ],
              { "Cache-Control": "private, no-store", Pragma: "no-cache" },
            );
            return { data: { claims: { sub: "user-1" } }, error: null };
          },
        },
      }),
    );
    const request = new NextRequest("https://marketvalley.example/campaigns/demo", {
      headers: { Cookie: "existing=one" },
    });

    const response = await refreshSupabaseSession(request);

    expect(request.cookies.get("sb-project-auth-token")?.value).toBe("opaque");
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("opaque");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("설정 중이거나 Auth가 실패해도 fixture route 요청을 통과시킨다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const partialConfigResponse = await refreshSupabaseSession(
      new NextRequest("https://marketvalley.example/campaigns/demo"),
    );
    expect(partialConfigResponse.status).toBe(200);
    expect(createServerClientMock).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    createServerClientMock.mockReturnValue({
      auth: { getClaims: async () => Promise.reject(new Error("network unavailable")) },
    });
    const outageResponse = await refreshSupabaseSession(
      new NextRequest("https://marketvalley.example/campaigns/demo"),
    );
    expect(outageResponse.status).toBe(200);
  });
});
