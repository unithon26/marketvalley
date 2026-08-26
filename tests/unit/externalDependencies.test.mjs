import { describe, expect, it, vi } from "vitest";

import { verifyExternalDependencies } from "../../deploy/verify-external-dependencies.mjs";

const environment = {
  ANTHROPIC_API_KEY: "anthropic-test-key",
  ANTHROPIC_TEXT_MODEL: "claude-haiku-test",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "supabase-publishable-test-key",
  SUPABASE_SECRET_KEY: "supabase-test-key",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-test-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret-test-key",
};

const requiredOpenApiSchema = {
  paths: {
    "/campaigns": {},
    "/campaign_reservations": {},
    "/meta_ad_runs": {},
    "/meta_insight_snapshots": {},
    "/rpc/claim_campaign_lifecycle": {},
    "/rpc/renew_campaign_lifecycle_lease": {},
    "/rpc/transition_campaign_lifecycle": {},
    "/rpc/delete_owned_unstarted_campaign": {},
    "/rpc/record_campaign_reservation": {},
    "/rpc/ad_generation_count_limits_disabled": {},
  },
};

describe("production external dependency preflight", () => {
  it("외부 생성을 실행하지 않고 model·schema·제한 제거 marker를 확인한다", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(requiredOpenApiSchema), { status: 200 }))
      .mockResolvedValueOnce(new Response("true", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation })).resolves.toEqual({
      anthropic: "ready",
      supabase: "ready",
      turnstile: "ready",
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(5);
    const [anthropicUrl, anthropicInit] = fetchImplementation.mock.calls[0];
    expect(String(anthropicUrl)).toBe("https://api.anthropic.com/v1/models/claude-haiku-test");
    expect(anthropicInit.headers["x-api-key"]).toBe("anthropic-test-key");

    const [settingsUrl, settingsInit] = fetchImplementation.mock.calls[1];
    expect(String(settingsUrl)).toBe("https://project.supabase.co/auth/v1/settings");
    expect(settingsInit.headers.apikey).toBe("supabase-publishable-test-key");
    expect(settingsInit.headers.Authorization).toBeUndefined();

    const [openApiUrl, openApiInit] = fetchImplementation.mock.calls[2];
    expect(String(openApiUrl)).toBe("https://project.supabase.co/rest/v1/");
    expect(openApiInit.headers.Authorization).toBe("Bearer supabase-test-key");

    const [markerUrl, markerInit] = fetchImplementation.mock.calls[3];
    expect(String(markerUrl)).toBe("https://project.supabase.co/rest/v1/rpc/ad_generation_count_limits_disabled");
    expect(markerInit.method).toBe("POST");
    expect(markerInit.headers.Authorization).toBe("Bearer supabase-test-key");

    const [turnstileUrl, turnstileInit] = fetchImplementation.mock.calls[4];
    expect(String(turnstileUrl)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(turnstileInit.method).toBe("POST");
  });

  it("Anthropic 인증 실패를 본문이나 키 없이 거절한다", async () => {
    const fetchImplementation = vi.fn(async () => new Response("sensitive", { status: 401 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Anthropic Models API rejected the production credentials (401)");
  });

  it("Supabase migration 또는 server key 실패를 활성화 전에 거절한다", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Supabase REST OpenAPI rejected the production credentials (404)");
  });

  it("required tables or lifecycle RPC migration이 없으면 활성화 전에 거절한다", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paths: { "/campaigns": {} } }), { status: 200 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Supabase REST OpenAPI is missing required path /campaign_reservations");
  });

  it("광고 생성 횟수 제한 제거 migration이 적용되지 않았으면 활성화 전에 거절한다", async () => {
    const schemaWithoutMarker = structuredClone(requiredOpenApiSchema);
    delete schemaWithoutMarker.paths["/rpc/ad_generation_count_limits_disabled"];
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(schemaWithoutMarker), { status: 200 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Supabase REST OpenAPI is missing required path /rpc/ad_generation_count_limits_disabled");
  });

  it("광고 생성 횟수 제한 제거 marker가 true가 아니면 활성화 전에 거절한다", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(requiredOpenApiSchema), { status: 200 }))
      .mockResolvedValueOnce(new Response("false", { status: 200 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Supabase ad generation count limits are not disabled");
  });

  it("서비스 키를 출력하지 않고 필수 설정 누락을 거절한다", async () => {
    await expect(verifyExternalDependencies({
      environment: { ...environment, SUPABASE_SECRET_KEY: "" },
      fetchImplementation: vi.fn(),
    })).rejects.toThrow("a Supabase server key is required");
  });

  it("Supabase publishable key가 없으면 public 인증 점검 전에 거절한다", async () => {
    await expect(verifyExternalDependencies({
      environment: { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
      fetchImplementation: vi.fn(),
    })).rejects.toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
  });

  it("Turnstile secret가 invalid-input-response 이외를 반환하면 활성화 전에 거절한다", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(requiredOpenApiSchema), { status: 200 }))
      .mockResolvedValueOnce(new Response("true", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-secret"] }), { status: 200 }));

    await expect(verifyExternalDependencies({ environment, fetchImplementation }))
      .rejects.toThrow("Cloudflare Turnstile Siteverify rejected the production secret");
  });
});
