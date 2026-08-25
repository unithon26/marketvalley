import { describe, expect, it, vi } from "vitest";

import { routeErrorResponse } from "@/app/api/_lib/http";
import {
  GenerationRateLimitConfigError,
  GenerationRateLimitUnavailableError,
  SupabaseGenerationRateLimiter,
  resolveGenerationQuotaConfig,
} from "@/lib/ai/generationRateLimit";

const liveEnvironment = {
  NODE_ENV: "production",
  CAMPAIGN_GENERATOR_MODE: "anthropic",
  CAMPAIGN_REPOSITORY_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SIGNAL_HASH_SECRET: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-test-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret-test-key",
};

describe("generation quota config", () => {
  it("Supabase repository에서 보수적인 분산 기본 한도를 선택한다", () => {
    expect(resolveGenerationQuotaConfig(liveEnvironment)).toEqual({
      mode: "supabase",
      maximumRequests: 3,
      windowSeconds: 60,
      dailyUserLimit: 30,
      dailyGlobalLimit: 300,
    });
  });

  it("production Anthropic이 메모리 제한으로 배포되는 구성을 거절한다", () => {
    expect(() => resolveGenerationQuotaConfig({
      NODE_ENV: "production",
      CAMPAIGN_GENERATOR_MODE: "anthropic",
      CAMPAIGN_REPOSITORY_MODE: "fixture",
    })).toThrow(GenerationRateLimitConfigError);
  });

  it("한도 범위와 사용자/전체 일일 한도 순서를 검증한다", () => {
    expect(() => resolveGenerationQuotaConfig({
      ...liveEnvironment,
      ANTHROPIC_RATE_LIMIT_MAX_REQUESTS: "0",
    })).toThrow(GenerationRateLimitConfigError);
    expect(() => resolveGenerationQuotaConfig({
      ...liveEnvironment,
      ANTHROPIC_DAILY_USER_LIMIT: "301",
      ANTHROPIC_DAILY_GLOBAL_LIMIT: "300",
    })).toThrow(GenerationRateLimitConfigError);
  });
});

describe("Supabase generation quota adapter", () => {
  it("원자 RPC에 검증된 사용자와 모든 한도를 전달한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const config = resolveGenerationQuotaConfig(liveEnvironment);
    const limiter = new SupabaseGenerationRateLimiter({ rpc } as never, config);

    await expect(limiter.consume("00000000-0000-0000-0000-000000000001")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_generation_quota", {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_max_requests: 3,
      p_window_seconds: 60,
      p_daily_user_limit: 30,
      p_daily_global_limit: 300,
    });
  });

  it("DB 오류를 제한 우회가 아닌 503 경계로 올린다", async () => {
    const limiter = new SupabaseGenerationRateLimiter({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } }),
    } as never, resolveGenerationQuotaConfig(liveEnvironment));
    await expect(limiter.consume("00000000-0000-0000-0000-000000000001"))
      .rejects.toBeInstanceOf(GenerationRateLimitUnavailableError);

    const response = routeErrorResponse(new GenerationRateLimitUnavailableError());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "generation_rate_limit_unavailable" },
    });
  });
});
