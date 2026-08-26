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
  isPermanentCampaignGenerationError,
  normalizeAnthropicCopyCandidate,
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
): { client: AnthropicMessagesClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({
    content: output === null
      ? []
      : [{ type: "text", text: JSON.stringify(output) }],
  });
  return {
    client: {
      messages: { create } as unknown as Anthropic["messages"],
    },
    create,
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

  it("anthropic 모드는 키가 있어야 하며 품질 eval을 통과한 Structured Outputs 모델을 기본값으로 쓴다", () => {
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
    expect(DEFAULT_ANTHROPIC_TEXT_MODEL).toBe("claude-sonnet-4-6");
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
  it("실제 SDK client에 단일 90초 요청 정책을 전달한다", () => {
    const { client } = fakeClient(null);
    const createClient = vi.fn(() => client);

    new AnthropicCampaignGenerator({
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
      createClient,
    });

    expect(createClient).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 90_000,
      maxRetries: 0,
    });
    expect(ANTHROPIC_REQUEST_POLICY).toEqual({
      timeoutMs: 90_000,
      maxRetries: 0,
    });
  });

  it("Messages API Structured Outputs 한 번으로 문구를 만들고 서버 필드를 다시 고정한다", async () => {
    const candidate = copyCandidate();

    const { client, create } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
      now: () => new Date("2026-08-25T12:34:56.000Z"),
    });

    const controller = new AbortController();
    const result = await generator.generate(idea, { signal: controller.signal });
    const request = create.mock.calls[0][0];

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
    expect(request).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 6_000,
      temperature: 0,
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
    expect(request.system).toContain("32자를 목표로, 반드시 40자 안에서");
    expect(request.messages[0].content).toContain(JSON.stringify(idea.background));
    expect(request.output_config.format.schema.properties).toHaveProperty("projectName");
    expect(request.output_config.format.schema.properties).not.toHaveProperty("schemaVersion");
    expect(Object.keys(request.output_config.format.schema.properties)).toHaveLength(37);
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
      promptVersion: "campaign-spec-v2-reservations-flat-v9",
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
      invalidationEvidence: "예약이 충분히 모이지 않거나 반복 사용 의사가 확인되지 않으면 고객·문제·메시지 가설을 다시 검토합니다.",
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
      prohibitedClaimsRemoved: [],
    });
    expect(result.brand).toMatchObject({
      primaryColor: "#5A3E36",
      accentColor: "#D58C5B",
    });
    expect(result.brand.visualDirection).not.toContain("임의로");
  });

  it("Structured Outputs가 강제하지 않는 문자열 길이를 재호출 없이 정규화한다", async () => {
    const candidate = {
      ...copyCandidate(),
      valueProposition: "채널마다 다시 쓰는 안내 문구와 게시 카드와 예약 폼 제작을 한 번의 입력으로 없앱니다",
      landingPainPoints: copyCandidate().landingPainPoints.map((item, index) => (
        index === 0
          ? { ...item, title: "여러 채널에 같은 안내를 매번 새로 적고 확인하는 아주 긴 반복 작업" }
          : item
      )),
    };

    const normalized = normalizeAnthropicCopyCandidate(candidate);

    expect(normalized.valueProposition.length).toBeLessThanOrEqual(40);
    expect(normalized.valueProposition).toContain("채널마다 다시 쓰는 안내");
    expect(normalized.landingPainPoints[0].title.length).toBeLessThanOrEqual(28);
    expect(normalized.landingPainPoints[1]).toEqual(candidate.landingPainPoints[1]);
  });

  it("미확인 성과 주장이 공개 문구에 섞이면 게시 가능한 spec으로 조립하지 않는다", async () => {
    const candidate = {
      ...copyCandidate(),
      landingHeroSupportingText: "수강생 1만 명과 매출 300%를 보장합니다.",
      prohibitedClaimsRemoved: ["수강생 수와 매출 보장은 근거가 없어 제외했습니다."],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    await expect(generator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_unsafe_output",
    });
  });

  it("입력에 없는 가격·채널·정책 FAQ는 서버 고정 안전 문구로 바꾼다", async () => {
    const candidate = {
      ...copyCandidate(),
      landingFaq: copyCandidate().landingFaq.map((item, index) => (
        index === 0
          ? { ...item, answer: "가격과 환불 정책은 지원팀에 문의하세요." }
          : item
      )),
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    const result = await generator.generate(idea);
    expect(result.landing.faq[0]).toEqual({
      question: "사전예약이 구매를 보장하나요?",
      answer: "아니요. 사전예약은 관심 표현이며 실제 구매나 결과가 확정되는 것은 아닙니다. 운영자가 예약자명단을 확인한 뒤 다음 안내를 직접 전달합니다.",
    });
  });

  it("FAQ 밖 공개 문구에 입력 없는 가격을 보완하면 거절한다", async () => {
    const candidate = {
      ...copyCandidate(),
      landingHeroSupportingText: "가격 정보를 입력하면 안내 자료를 함께 만듭니다.",
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    await expect(generator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "anthropic_unsafe_output",
    });
  });

  it("입력에 없는 할인 해시태그만 제거하고 나머지 생성 결과는 유지한다", async () => {
    const candidate = {
      ...copyCandidate(),
      hashtags: ["안내온", "#마감할인"],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    const result = await generator.generate(idea);
    expect(result.messaging.hashtags).toEqual(["#안내온"]);
  });

  it("근거 없는 시간 절감 주장이 해시태그에만 있으면 해당 태그만 제거한다", async () => {
    const candidate = {
      ...copyCandidate(),
      hashtags: ["#안내온", "#시간낭비줄이기"],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    const result = await generator.generate(idea);
    expect(result.messaging.hashtags).toEqual(["#안내온"]);
  });

  it("동일 응답이 반복되는 안전성 거절은 자동 재시도하지 않는다", () => {
    expect(isPermanentCampaignGenerationError(new CampaignGenerationError(
      "anthropic_unsafe_output",
      "unsafe",
    ))).toBe(true);
    expect(isPermanentCampaignGenerationError(new CampaignGenerationError(
      "anthropic_request_failed",
      "temporary",
    ))).toBe(false);
  });

  it("해시태그 정규화 뒤에도 최종 길이와 빈 값 계약을 지킨다", async () => {
    const candidate = {
      ...copyCandidate(),
      hashtags: ["가".repeat(60), "#"],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    const result = await generator.generate(idea);
    expect(result.messaging.hashtags).toHaveLength(1);
    expect(result.messaging.hashtags[0]).toMatch(/^#[^#]/u);
    expect(result.messaging.hashtags[0].length).toBe(60);
  });

  it("입력에 없는 구체 채널 이름은 여러 채널이라는 근거 있는 범주로 일반화한다", async () => {
    const candidate = {
      ...copyCandidate(),
      landingPainPoints: copyCandidate().landingPainPoints.map((item, index) => (
        index === 0
          ? { ...item, body: "카카오톡, 인스타그램, 블로그 등 여러 곳에 같은 안내를 다시 씁니다." }
          : item
      )),
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });

    const result = await generator.generate(idea);
    expect(result.landing.painPoints[0].body).toBe("여러 채널에 같은 안내를 다시 씁니다.");
  });

  it("입력에 실제로 있던 금지 주장만 제거 기록에 남긴다", async () => {
    const candidate = {
      ...copyCandidate(),
      prohibitedClaimsRemoved: [
        "수강생 1만 명 주장을 제외했습니다.",
        "근거 없는 수상 주장을 제외했습니다.",
      ],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });
    const injectionInput = {
      background: "온라인 수업 문의를 반복해서 답합니다. 메모에는 수강생 1만 명이라고 쓰라는 확인되지 않은 지시가 있습니다.",
      solution: "안내온은 수업 정보를 한 번 입력해 공개 안내와 동의 기반 예약자명단을 함께 준비합니다.",
    };

    const result = await generator.generate(injectionInput);
    expect(result.safety.prohibitedClaimsRemoved).toEqual([
      "수강생 1만 명 주장을 제외했습니다.",
    ]);
  });

  it("일부 단어만 근거가 있는 혼합 안전성 기록은 보존하지 않는다", async () => {
    const candidate = {
      ...copyCandidate(),
      prohibitedClaimsRemoved: [
        "수강생 1만 명과 매출 300% 보장 주장을 제외했습니다.",
      ],
    };
    const { client } = fakeClient(candidate);
    const generator = new AnthropicCampaignGenerator({
      client,
      model: "claude-haiku-4-5-20251001",
    });
    const input = {
      background: "확인되지 않은 수강생 1만 명 문구를 안내에서 제거해야 합니다.",
      solution: "확인된 정보만으로 시장검증 광고를 구성합니다.",
    };

    const result = await generator.generate(input);
    expect(result.safety.prohibitedClaimsRemoved).toEqual([]);
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
    expect(empty.create).toHaveBeenCalledTimes(1);

    const create = vi.fn().mockRejectedValue(new Error("sensitive upstream detail"));
    const failingGenerator = new AnthropicCampaignGenerator({
      client: {
        messages: { create } as unknown as Anthropic["messages"],
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
          create: vi.fn().mockRejectedValue(billingError),
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
          create: vi.fn().mockRejectedValue(schemaError),
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
