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
  ANTHROPIC_REQUEST_POLICY,
  CampaignGenerationError,
  AnthropicCampaignGenerator,
  anthropicCampaignCopySchema,
  type AnthropicMessagesClient,
} from "@/lib/ai/anthropicCampaignGenerator";
import type { CampaignSpec } from "@/lib/contracts/campaign";
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

function countSchemaNodes(value: unknown, type: string): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countSchemaNodes(item, type), 0);
  }

  const record = value as Record<string, unknown>;
  return (record.type === type ? 1 : 0)
    + Object.values(record).reduce<number>(
      (total, item) => total + countSchemaNodes(item, type),
      0,
    );
}

function copyCandidate(spec: CampaignSpec = demoCampaign) {
  return anthropicCampaignCopySchema.parse({
    projectName: spec.project.name,
    projectOneLiner: spec.project.oneLiner,
    projectCategory: spec.project.category,
    validationCustomer: spec.validation.customer,
    validationProblem: spec.validation.problem,
    validationSolution: spec.validation.solution,
    validationExpectedSignal: spec.validation.expectedSignal,
    validationInvalidationEvidence: spec.validation.invalidationEvidence,
    validationAssumptions: spec.validation.assumptions,
    signalType: spec.validation.signal.type,
    signalCtaLabel: spec.validation.signal.ctaLabel,
    signalQuestion: spec.validation.signal.question,
    signalOptionLabels: spec.validation.signal.options.map((option) => option.label),
    signalSuccessMessage: spec.validation.signal.successMessage,
    brandTone: spec.brand.tone,
    carouselCoverTemplate: spec.templates.carouselCover,
    landingIntroTemplate: spec.templates.landingIntro,
    valueProposition: spec.messaging.valueProposition,
    hooks: spec.messaging.hooks,
    socialCaption: spec.messaging.caption,
    hashtags: spec.messaging.hashtags,
    landingSeoTitle: spec.landing.seoTitle,
    landingHeroEyebrow: spec.landing.hero.eyebrow,
    landingHeroSupportingText: spec.landing.hero.supportingText,
    landingPainPoints: spec.landing.painPoints,
    landingBenefits: spec.landing.benefits,
    landingSteps: spec.landing.steps,
    landingFaq: spec.landing.faq,
    carouselHookBody: spec.carousel.hookBody,
    carouselProblemHeadline: spec.carousel.problem.headline,
    carouselProblemBody: spec.carousel.problem.body,
    carouselInsightHeadline: spec.carousel.insight.headline,
    carouselInsightBody: spec.carousel.insight.body,
    carouselSolutionBody: spec.carousel.solutionBody,
    carouselCtaBody: spec.carousel.ctaBody,
    carouselVisualPrompts: spec.carousel.visualPrompts,
    claimsToReview: spec.safety.claimsToReview,
    prohibitedClaimsRemoved: spec.safety.prohibitedClaimsRemoved,
  });
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
  it("실제 SDK client에 단일 60초 요청 정책을 전달한다", () => {
    const { client } = fakeClient(null);
    const createClient = vi.fn(() => client);

    new AnthropicCampaignGenerator({
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
      createClient,
    });

    expect(createClient).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 60_000,
      maxRetries: 0,
    });
    expect(ANTHROPIC_REQUEST_POLICY).toEqual({
      timeoutMs: 60_000,
      maxRetries: 0,
    });
  });

  it("Messages API Structured Outputs 한 번으로 문구를 만들고 서버 필드를 다시 고정한다", async () => {
    const candidate = copyCandidate();

    const { client, parse } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
      now: () => new Date("2026-08-25T12:34:56.000Z"),
    });

    const controller = new AbortController();
    const result = await generator.generate(idea, { signal: controller.signal });
    const request = parse.mock.calls[0][0];

    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][1]).toEqual({ signal: controller.signal });
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
    expect(request.output_config.format.schema.properties).toHaveProperty("projectName");
    expect(request.output_config.format.schema.properties).not.toHaveProperty("schemaVersion");
    expect(Object.keys(request.output_config.format.schema.properties)).toHaveLength(38);
    expect(countSchemaNodes(request.output_config.format.schema, "object")).toBe(3);
    expect(JSON.stringify(request.output_config.format.schema).length).toBeLessThan(6_500);
    expect(result.landing).toEqual({
      seoTitle: candidate.landingSeoTitle,
      hero: {
        eyebrow: candidate.landingHeroEyebrow,
        supportingText: candidate.landingHeroSupportingText,
      },
      painPoints: candidate.landingPainPoints,
      benefits: candidate.landingBenefits,
      steps: candidate.landingSteps,
      faq: candidate.landingFaq,
    });
    expect(result.generation).toEqual({
      promptVersion: "campaign-spec-v2-reservations-flat-v2",
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
    expect(result.project).toEqual({
      name: candidate.projectName,
      oneLiner: candidate.projectOneLiner,
      category: candidate.projectCategory,
      language: "ko",
    });
    expect(result.validation).toMatchObject({
      customer: candidate.validationCustomer,
      problem: candidate.validationProblem,
      solution: candidate.validationSolution,
      expectedSignal: candidate.validationExpectedSignal,
      invalidationEvidence: candidate.validationInvalidationEvidence,
      assumptions: candidate.validationAssumptions,
      signal: {
        type: candidate.signalType,
        ctaLabel: candidate.signalCtaLabel,
        question: candidate.signalQuestion,
        successMessage: candidate.signalSuccessMessage,
      },
    });
    expect(result.validation.signal.options.map((option) => option.label)).toEqual(
      candidate.signalOptionLabels,
    );
    expect(result.templates).toEqual({
      carouselCover: candidate.carouselCoverTemplate,
      landingIntro: candidate.landingIntroTemplate,
    });
    expect(result.messaging).toEqual({
      valueProposition: candidate.valueProposition,
      hooks: candidate.hooks,
      caption: candidate.socialCaption,
      hashtags: candidate.hashtags,
    });
    expect(result.carousel).toEqual({
      hookBody: candidate.carouselHookBody,
      problem: {
        headline: candidate.carouselProblemHeadline,
        body: candidate.carouselProblemBody,
      },
      insight: {
        headline: candidate.carouselInsightHeadline,
        body: candidate.carouselInsightBody,
      },
      solutionBody: candidate.carouselSolutionBody,
      ctaBody: candidate.carouselCtaBody,
      visualPrompts: candidate.carouselVisualPrompts,
    });
    expect(result.safety).toEqual({
      claimsToReview: candidate.claimsToReview,
      prohibitedClaimsRemoved: candidate.prohibitedClaimsRemoved,
    });
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
    expect(empty.parse).toHaveBeenCalledTimes(1);

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

    const schemaError = Object.assign(new Error("secret schema detail"), {
      status: 400,
      type: "invalid_request_error",
      error: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "The compiled grammar is too large.",
        },
      },
    });
    const schemaGenerator = new AnthropicCampaignGenerator({
      client: {
        messages: {
          parse: vi.fn().mockRejectedValue(schemaError),
        } as unknown as Anthropic["messages"],
      },
      model: "claude-haiku-4-5-20251001",
    });
    await expect(schemaGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_schema_error",
      message: "Anthropic 구조화 출력 스키마를 컴파일하지 못했습니다.",
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

    const schemaResponse = routeErrorResponse(
      new CampaignGenerationError("anthropic_schema_error", "secret schema detail"),
    );
    expect(schemaResponse.status).toBe(503);
    expect((await schemaResponse.json()).error.code).toBe("campaign_generation_schema_error");
  });
});
