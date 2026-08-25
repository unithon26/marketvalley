import { describe, expect, it, vi } from "vitest";

import { handleGenerateCampaign } from "@/app/api/generate/route";
import { InMemoryGenerationRateLimiter } from "@/lib/ai/generationRateLimit";
import { AuthenticationRequiredError } from "@/lib/auth/authorization";
import type { CampaignGenerator } from "@/lib/contracts/generator";
import { demoCampaign } from "@/lib/demo/demo-campaign";

const idea = {
  background: "고객 문의 내용을 채널마다 다시 쓰느라 실제 상담과 판단에 쓸 시간이 줄어듭니다.",
  solution: "안내온은 한 번 입력한 상품명과 특징으로 랜딩, 카드뉴스와 게시 문구를 함께 구성합니다.",
};

function request(options: { origin?: string; contentType?: string } = {}): Request {
  const headers = new Headers();
  if (options.origin) headers.set("Origin", options.origin);
  if (options.contentType) headers.set("Content-Type", options.contentType);
  return new Request("https://marketvalley.example/api/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(idea),
  });
}

function dependencies(options: {
  mode?: "anthropic" | "fixture";
  requireIdentity?: () => Promise<{ userId: string }>;
  consumeQuota?: (userId: string) => boolean;
} = {}) {
  const generator = {
    generate: vi.fn().mockResolvedValue(structuredClone(demoCampaign)),
  } satisfies CampaignGenerator;

  return {
    generator,
    value: {
      environment: {
        CAMPAIGN_GENERATOR_MODE: options.mode ?? "anthropic",
        ANTHROPIC_API_KEY: "test-key-that-must-not-be-used",
        NEXT_PUBLIC_SITE_URL: "https://marketvalley.example",
        NODE_ENV: "production",
      },
      createGenerator: vi.fn(() => generator),
      requireIdentity: options.requireIdentity ?? vi.fn(async () => ({ userId: "user-1" })),
      consumeQuota: options.consumeQuota ?? vi.fn(() => true),
    },
  };
}

describe("AI campaign generation route", () => {
  it("같은 origin의 로그인 사용자만 AI 문구 생성을 실행한다", async () => {
    const { generator, value } = dependencies();
    const incoming = request({
      origin: "https://marketvalley.example",
      contentType: "application/json; charset=utf-8",
    });
    const response = await handleGenerateCampaign(incoming, value);

    expect(response.status).toBe(200);
    expect(value.requireIdentity).toHaveBeenCalledTimes(1);
    expect(value.consumeQuota).toHaveBeenCalledWith("user-1", value.environment);
    expect(generator.generate).toHaveBeenCalledWith(idea, { signal: incoming.signal });
  });

  it("교차 origin과 JSON이 아닌 AI 요청을 인증·생성 전에 거절한다", async () => {
    for (const [incoming, expectedCode, expectedStatus] of [
      [request({ origin: "https://attacker.example", contentType: "application/json" }), "invalid_origin", 403],
      [request({ origin: "https://marketvalley.example", contentType: "text/plain" }), "unsupported_media_type", 415],
    ] as const) {
      const { generator, value } = dependencies();
      const response = await handleGenerateCampaign(incoming, value);
      const body = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(body.error.code).toBe(expectedCode);
      expect(value.requireIdentity).not.toHaveBeenCalled();
      expect(generator.generate).not.toHaveBeenCalled();
    }
  });

  it("로그인하지 않은 AI 요청과 사용자별 할당량 초과를 명시한다", async () => {
    const unauthenticated = dependencies({
      requireIdentity: vi.fn(async () => { throw new AuthenticationRequiredError(); }),
    });
    const unauthenticatedResponse = await handleGenerateCampaign(request({
      origin: "https://marketvalley.example",
      contentType: "application/json",
    }), unauthenticated.value);
    expect(unauthenticatedResponse.status).toBe(401);
    expect((await unauthenticatedResponse.json()).error.code).toBe("authentication_required");

    const limited = dependencies({ consumeQuota: vi.fn(() => false) });
    const limitedResponse = await handleGenerateCampaign(request({
      origin: "https://marketvalley.example",
      contentType: "application/json",
    }), limited.value);
    expect(limitedResponse.status).toBe(429);
    expect((await limitedResponse.json()).error.code).toBe("generation_rate_limited");
    expect(limited.generator.generate).not.toHaveBeenCalled();
  });

  it("명시적 fixture fallback은 인증과 유료 호출 제한 없이 기존 데모를 유지한다", async () => {
    const { generator, value } = dependencies({ mode: "fixture" });
    const incoming = request();
    const response = await handleGenerateCampaign(incoming, value);

    expect(response.status).toBe(200);
    expect(value.requireIdentity).not.toHaveBeenCalled();
    expect(value.consumeQuota).not.toHaveBeenCalled();
    expect(generator.generate).toHaveBeenCalledWith(idea, { signal: incoming.signal });
  });
});

describe("InMemoryGenerationRateLimiter", () => {
  it("사용자별 window 안의 호출을 제한하고 window가 지나면 다시 허용한다", () => {
    let now = 1_000;
    const limiter = new InMemoryGenerationRateLimiter(2, 60_000, () => now);

    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);
    expect(limiter.consume("user-2")).toBe(true);

    now += 60_000;
    expect(limiter.consume("user-1")).toBe(true);
  });
});
