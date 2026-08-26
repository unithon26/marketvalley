import { describe, expect, it } from "vitest";

import { createHealthResponse } from "@/app/api/health/route";

const supabaseEnvironment = {
  CAMPAIGN_GENERATOR_MODE: "anthropic",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  CAMPAIGN_REPOSITORY_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SIGNAL_HASH_SECRET: "0123456789abcdef0123456789abcdef", // gitleaks:allow -- deterministic test fixture
  APP_VERSION: "0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-test-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret-test-key",
};

describe("health route", () => {
  it("fixture 발표 환경을 준비 상태로 표시한다", async () => {
    const response = createHealthResponse({
      CAMPAIGN_GENERATOR_MODE: "fixture",
      CAMPAIGN_REPOSITORY_MODE: "fixture",
      APP_VERSION: "presentation",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      version: "presentation",
      origin: "unknown",
      checks: {
        generator: { mode: "fixture", ready: true },
        repository: { mode: "fixture", ready: true },
        reservations: { mode: "fixture", ready: true },
      },
    });
  });

  it("Anthropic 키가 없는 운영 모드를 거절한다", async () => {
    const response = createHealthResponse({
      ...supabaseEnvironment,
      ANTHROPIC_API_KEY: "",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      checks: { generator: { mode: "anthropic", ready: false } },
    });
  });

  it("Supabase 서버 설정이 불완전한 운영 모드를 거절한다", async () => {
    const response = createHealthResponse({
      ...supabaseEnvironment,
      SIGNAL_HASH_SECRET: "too-short",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      version: "0123456789abcdef",
    });
  });

  it("완전한 운영 설정과 배포 버전만 노출한다", async () => {
    const response = createHealthResponse(supabaseEnvironment);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "marketvalley",
      version: "0123456789abcdef",
      origin: "https://marketvalley.example.com",
      checks: {
        generator: { mode: "anthropic", ready: true },
        repository: { mode: "supabase", ready: true },
        reservations: { mode: "turnstile", ready: true },
      },
    });
  });

  it("Vercel Git 배포 SHA를 APP_VERSION fallback으로 노출한다", async () => {
    const vercelSha = "975a8066333cbc14c26af2491a2e9493791558ae";
    const response = createHealthResponse({
      ...supabaseEnvironment,
      APP_VERSION: undefined,
      VERCEL_GIT_COMMIT_SHA: vercelSha,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: vercelSha,
    });
  });

  it("임의 환경변수를 버전 응답에 반사하지 않는다", async () => {
    const response = createHealthResponse({
      CAMPAIGN_GENERATOR_MODE: "fixture",
      CAMPAIGN_REPOSITORY_MODE: "fixture",
      APP_VERSION: "<script>alert(1)</script>",
      NEXT_PUBLIC_SITE_URL: "https://user:password@example.com/private?token=value",
    });

    await expect(response.json()).resolves.toMatchObject({
      version: "unknown",
      origin: "unknown",
    });
  });
});
