import { describe, expect, it } from "vitest";

import {
  getAuthCookieOptions,
  getOptionalSupabaseConfig,
  SupabaseConfigurationError,
} from "@/lib/supabase/config";
import {
  isSameOriginMutation,
  resolveAppOrigin,
  sanitizeNextPath,
} from "@/lib/auth/security";

describe("auth security", () => {
  it("같은 origin의 앱 내부 next 경로만 허용한다", () => {
    expect(sanitizeNextPath("/campaigns/demo?tab=result#summary")).toBe(
      "/campaigns/demo?tab=result#summary",
    );
    expect(sanitizeNextPath("https://attacker.example/path")).toBe("/");
    expect(sanitizeNextPath("//attacker.example/path")).toBe("/");
    expect(sanitizeNextPath("/\\attacker.example")).toBe("/");
    expect(sanitizeNextPath("/auth/callback?code=stolen")).toBe("/");
    expect(sanitizeNextPath("/api/auth/session")).toBe("/");
  });

  it("배포 origin은 명시된 HTTPS 사이트 URL만 신뢰한다", () => {
    expect(
      resolveAppOrigin("https://forged.example/auth/google", {
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://marketvalley.example/some-path",
      }),
    ).toBe("https://marketvalley.example");

    expect(() =>
      resolveAppOrigin("https://forged.example/auth/google", { NODE_ENV: "production" }),
    ).toThrow(SupabaseConfigurationError);
    expect(() =>
      resolveAppOrigin("https://forged.example/auth/google", { NODE_ENV: "development" }),
    ).toThrow(SupabaseConfigurationError);
    expect(
      resolveAppOrigin("http://localhost:3000/auth/google", { NODE_ENV: "development" }),
    ).toBe("http://localhost:3000");
  });

  it("로그아웃 요청의 Origin을 정확히 비교한다", () => {
    const sameOrigin = new Request("https://marketvalley.example/auth/logout", {
      method: "POST",
      headers: { Origin: "https://marketvalley.example" },
    });
    const crossOrigin = new Request("https://marketvalley.example/auth/logout", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });
    const missingOrigin = new Request("https://marketvalley.example/auth/logout", {
      method: "POST",
    });

    expect(isSameOriginMutation(sameOrigin, "https://marketvalley.example")).toBe(true);
    expect(isSameOriginMutation(crossOrigin, "https://marketvalley.example")).toBe(false);
    expect(isSameOriginMutation(missingOrigin, "https://marketvalley.example")).toBe(false);
  });

  it("publishable key와 HttpOnly 쿠키 정책을 강제한다", () => {
    expect(
      getOptionalSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/path",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
    expect(() =>
      getOptionalSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }),
    ).toThrow(SupabaseConfigurationError);
    expect(getAuthCookieOptions({ NODE_ENV: "production" })).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
