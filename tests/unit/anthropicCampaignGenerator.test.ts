import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { routeErrorResponse } from "@/app/api/_lib/http";
import { createCampaignGenerator } from "@/lib/ai/campaignGenerator";
import {
  DEFAULT_ANTHROPIC_TEXT_MODEL,
  CampaignGeneratorConfigError,
  resolveCampaignGeneratorConfig,
  resolveCampaignGeneratorMode,
  resolveCampaignGeneratorStatus,
} from "@/lib/ai/generatorConfig";
import {
  CampaignGenerationError,
  AnthropicCampaignGenerator,
  type AnthropicMessagesClient,
} from "@/lib/ai/anthropicCampaignGenerator";
import type { CampaignGenerator } from "@/lib/contracts/generator";
import { demoCampaign } from "@/lib/demo/demo-campaign";

const idea = {
  background: "고객 문의 내용을 채널마다 다시 쓰느라 실제 상담과 판단에 쓸 시간이 줄어듭니다.",
  solution: "안내온은 한 번 입력한 상품명과 특징으로 랜딩, 카드뉴스와 게시 문구를 함께 구성합니다.",
};

function fakeClient(
  output: unknown,
): { client: AnthropicMessagesClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn().mockResolvedValue({ parsed_output: output });
  return {
    client: {
      messages: { parse } as unknown as Anthropic["messages"],
    },
    parse,
  };
}

describe("campaign generator configuration", () => {
  it("Anthropic을 선택하면 키 준비 상태를 표시한다", () => {
    expect(resolveCampaignGeneratorMode({ CAMPAIGN_GENERATOR_MODE: "anthropic" })).toBe("anthropic");
    expect(resolveCampaignGeneratorStatus({ CAMPAIGN_GENERATOR_MODE: "anthropic" })).toEqual({ mode: "anthropic", ready: false });
    expect(resolveCampaignGeneratorStatus({
      CAMPAIGN_GENERATOR_MODE: "anthropic",
      ANTHROPIC_API_KEY: "test-key-that-must-not-be-used",
    })).toEqual({ mode: "anthropic", ready: true });
    expect(() => resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "anthropic",
    })).toThrow(CampaignGeneratorConfigError);
  });

  it("자동 테스트와 비상 발표는 fixture를 명시적으로 선택한다", () => {
    expect(resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "fixture",
      ANTHROPIC_API_KEY: "test-key-that-must-not-be-used",
      ANTHROPIC_TEXT_MODEL: "paid-model-that-must-not-be-used",
    })).toEqual({ mode: "fixture" });
    expect(resolveCampaignGeneratorStatus({
      CAMPAIGN_GENERATOR_MODE: "fixture",
    })).toEqual({ mode: "fixture", ready: true });
  });

  it("anthropic 모드는 키가 있어야 하며 최저가 활성 Structured Outputs 모델을 기본값으로 쓴다", () => {
    expect(() => resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "anthropic",
    })).toThrow(CampaignGeneratorConfigError);

    expect(resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
    })).toEqual({
      mode: "anthropic",
      apiKey: "test-key",
      model: DEFAULT_ANTHROPIC_TEXT_MODEL,
    });
    expect(DEFAULT_ANTHROPIC_TEXT_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("알 수 없는 모드를 허용하지 않고 fixture와 anthropic 구현을 명시적으로 선택한다", () => {
    expect(() => resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "auto",
    })).toThrow(CampaignGeneratorConfigError);

    const fixture = { generate: vi.fn() } satisfies CampaignGenerator;
    const anthropic = { generate: vi.fn() } satisfies CampaignGenerator;
    const createAnthropic = vi.fn(() => anthropic);
    const dependencies = { fixture, createAnthropic };

    expect(createCampaignGenerator({ CAMPAIGN_GENERATOR_MODE: "fixture" }, dependencies)).toBe(fixture);
    expect(createAnthropic).not.toHaveBeenCalled();
    expect(createCampaignGenerator({
      CAMPAIGN_GENERATOR_MODE: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_TEXT_MODEL: "explicit-model",
    }, dependencies)).toBe(anthropic);
    expect(createAnthropic).toHaveBeenCalledWith({
      mode: "anthropic",
      apiKey: "test-key",
      model: "explicit-model",
    });
  });
});

describe("AnthropicCampaignGenerator", () => {
  it("Messages API Structured Outputs 한 번으로 문구를 만들고 서버 필드를 다시 고정한다", async () => {
    const candidate = structuredClone(demoCampaign);
    candidate.generation = {
      promptVersion: "model-controlled-value",
      model: "model-controlled-value",
      generatedAt: "2025-01-01T00:00:00.000Z",
    };
    candidate.validation.decisionRule = {
      minimumResponses: 10,
      minimumPositiveResponses: 10,
      description: "모델이 임의로 바꾼 기준",
    };
    candidate.validation.signal.options = [
      candidate.validation.signal.options[2],
      candidate.validation.signal.options[0],
      candidate.validation.signal.options[1],
    ];
    candidate.brand.primaryColor = "#FFFFFF";
    candidate.brand.accentColor = "#FFFFFF";
    candidate.brand.visualDirection = "모델이 임의로 바꾼 시각 지시";

    const { client, parse } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
      now: () => new Date("2026-08-25T12:34:56.000Z"),
    });

    const result = await generator.generate(idea);
    const request = parse.mock.calls[0][0];

    expect(parse).toHaveBeenCalledTimes(1);
    expect(request).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 6_000,
      messages: [
        { role: "user" },
      ],
      output_config: {
        format: {
          type: "json_schema",
        },
      },
    });
    expect(request.system).toContain("시장검증 광고 카피 생성기");
    expect(request.system).toContain("landing.hero.supportingText");
    expect(request.system).toContain("landing.painPoints[0..2].title");
    expect(request.system).toContain("landing.benefits[0..2].title");
    expect(request.system).toContain("landing.steps[0..2].title");
    expect(request.system).toContain("landing.faq[0..2].question");
    expect(request.messages[0].content).toContain(JSON.stringify(idea.background));
    expect(result.landing).toEqual(candidate.landing);
    expect(result.generation).toEqual({
      promptVersion: "campaign-spec-v2-reservations",
      model: "claude-haiku-4-5-20251001",
      generatedAt: "2026-08-25T12:34:56.000Z",
    });
    expect(result.validation.decisionRule).toEqual({
      minimumResponses: 5,
      minimumPositiveResponses: 3,
      description: "응답 5개 중 긍정 3개 이상이면 다음 검증을 이어갑니다.",
    });
    expect(result.validation.signal.options.map((option) => option.id)).toEqual([
      "positive",
      "neutral",
      "negative",
    ]);
    expect(result.brand).toMatchObject({
      primaryColor: "#5A3E36",
      accentColor: "#D58C5B",
    });
    expect(result.brand.visualDirection).not.toContain("임의로");
  });

  it("빈 구조화 응답과 upstream 오류를 안전한 생성 오류로 구분한다", async () => {
    const empty = fakeClient(null);
    const emptyGenerator = new AnthropicCampaignGenerator({
      client: empty.client,
      model: "claude-haiku-4-5-20251001",
    });
    await expect(emptyGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_empty_response",
    });
    expect(empty.parse).toHaveBeenCalledTimes(2);

    const parse = vi.fn().mockRejectedValue(new Error("sensitive upstream detail"));
    const failingGenerator = new AnthropicCampaignGenerator({
      client: {
        messages: { parse } as unknown as Anthropic["messages"],
      },
      model: "claude-haiku-4-5-20251001",
    });
    await expect(failingGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_request_failed",
      message: "Claude 문구 생성 요청을 완료하지 못했습니다.",
    });

    const billingError = Object.assign(new Error("secret billing detail"), {
      status: 402,
      type: "billing_error",
    });
    const billingGenerator = new AnthropicCampaignGenerator({
      client: {
        messages: {
          parse: vi.fn().mockRejectedValue(billingError),
        } as unknown as Anthropic["messages"],
      },
      model: "claude-haiku-4-5-20251001",
    });
    await expect(billingGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_billing_error",
      message: "Anthropic API 결제 상태를 확인해주세요.",
    });
  });

  it("설정·upstream 오류를 비밀정보 없는 503 응답으로 변환한다", async () => {
    for (const error of [
      new CampaignGeneratorConfigError("secret configuration detail"),
      new CampaignGenerationError("anthropic_request_failed", "secret upstream detail"),
    ]) {
      const response = routeErrorResponse(error);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(JSON.stringify(body)).not.toContain("secret");
    }

    const billingResponse = routeErrorResponse(
      new CampaignGenerationError("anthropic_billing_error", "secret billing detail"),
    );
    expect(billingResponse.status).toBe(503);
    expect((await billingResponse.json()).error.code).toBe("anthropic_billing_error");
  });
});
