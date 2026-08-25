import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  campaignSpecSchema,
  carouselCoverTemplateSchema,
  landingIntroTemplateSchema,
  type CampaignSpec,
} from "@/lib/contracts/campaign";
import {
  ideaInputSchema,
  type CampaignGenerator,
  type IdeaInput,
} from "@/lib/contracts/generator";
import {
  buildCampaignDeveloperPrompt,
  buildCampaignUserPrompt,
  CAMPAIGN_PROMPT_VERSION,
} from "@/lib/ai/campaignPrompts";

export const ANTHROPIC_REQUEST_POLICY = {
  timeoutMs: 60_000,
  maxRetries: 0,
} as const;

const ANTHROPIC_MAX_OUTPUT_TOKENS = 6_000;

const shortText = (maximum: number) => z.string().trim().min(1).max(maximum);

const uniqueStrings = (length: number, maximum: number) => (
  z.array(shortText(maximum)).length(length).refine(
    (items) => new Set(items.map((item) => JSON.stringify(item))).size === items.length,
    { message: `${length}개 항목은 서로 달라야 합니다.` },
  )
);

const titleBodySchema = z.object({
  title: shortText(28),
  body: shortText(90),
}).strict();

const faqSchema = z.object({
  question: shortText(100),
  answer: shortText(240),
}).strict();

/**
 * Claude only owns copy and allowlisted style choices. Keeping this contract flat
 * avoids compiling the complete, deeply nested CampaignSpec into an oversized
 * Structured Outputs grammar. The server assembles and validates CampaignSpec.
 */
export const anthropicCampaignCopySchema = z.object({
  projectName: shortText(80),
  projectOneLiner: shortText(120),
  projectCategory: shortText(80),
  validationCustomer: shortText(180),
  validationProblem: shortText(240),
  validationSolution: shortText(240),
  validationExpectedSignal: shortText(240),
  validationInvalidationEvidence: shortText(240),
  validationAssumptions: z.array(shortText(240)).max(6),
  signalType: z.enum(["problem_confirmation", "solution_interest"]),
  signalCtaLabel: shortText(40),
  signalQuestion: shortText(180),
  signalOptionLabels: uniqueStrings(3, 80),
  signalSuccessMessage: shortText(160),
  brandTone: z.enum(["trust", "bold", "warm"]),
  carouselCoverTemplate: carouselCoverTemplateSchema,
  landingIntroTemplate: landingIntroTemplateSchema,
  valueProposition: shortText(40),
  hooks: uniqueStrings(3, 70),
  socialCaption: shortText(1_200),
  hashtags: z.array(shortText(60)).min(1).max(12).refine(
    (items) => new Set(items).size === items.length,
    { message: "해시태그는 중복될 수 없습니다." },
  ),
  landingSeoTitle: shortText(100),
  landingHeroEyebrow: shortText(60),
  landingHeroSupportingText: shortText(180),
  landingPainPoints: z.array(titleBodySchema).length(3).refine(
    (items) => new Set(items.map((item) => item.title)).size === items.length,
    { message: "문제 카드 제목은 서로 달라야 합니다." },
  ),
  landingBenefits: z.array(titleBodySchema).length(3).refine(
    (items) => new Set(items.map((item) => item.title)).size === items.length,
    { message: "가치 카드 제목은 서로 달라야 합니다." },
  ),
  landingSteps: z.array(titleBodySchema).length(3).refine(
    (items) => new Set(items.map((item) => item.title)).size === items.length,
    { message: "작동 단계 제목은 서로 달라야 합니다." },
  ),
  landingFaq: z.array(faqSchema).length(3).refine(
    (items) => new Set(items.map((item) => item.question)).size === items.length,
    { message: "FAQ 질문은 서로 달라야 합니다." },
  ),
  carouselHookBody: shortText(180),
  carouselProblemHeadline: shortText(28),
  carouselProblemBody: shortText(90),
  carouselInsightHeadline: shortText(28),
  carouselInsightBody: shortText(90),
  carouselSolutionBody: shortText(180),
  carouselCtaBody: shortText(180),
  carouselVisualPrompts: uniqueStrings(5, 300),
  claimsToReview: z.array(shortText(240)).max(8),
  prohibitedClaimsRemoved: z.array(shortText(240)).max(8),
}).strict();

const FIXED_DECISION_RULE: CampaignSpec["validation"]["decisionRule"] = {
  minimumResponses: 5,
  minimumPositiveResponses: 3,
  description: "응답 5개 중 긍정 3개 이상이면 다음 검증을 이어갑니다.",
};

const BRAND_COLORS: Record<
  CampaignSpec["brand"]["tone"],
  Pick<CampaignSpec["brand"], "primaryColor" | "accentColor">
> = {
  trust: { primaryColor: "#263B5A", accentColor: "#6EA6D9" },
  bold: { primaryColor: "#191F28", accentColor: "#6B36E8" },
  warm: { primaryColor: "#5A3E36", accentColor: "#D58C5B" },
};

export type AnthropicMessagesClient = Pick<Anthropic, "messages">;

type AnthropicCampaignGeneratorOptions = {
  apiKey?: string;
  model: string;
  client?: AnthropicMessagesClient;
  createClient?: (config: {
    apiKey?: string;
    maxRetries: number;
    timeout: number;
  }) => AnthropicMessagesClient;
  now?: () => Date;
};

export class CampaignGenerationError extends Error {
  constructor(
    readonly code:
      | "anthropic_request_failed"
      | "anthropic_empty_response"
      | "anthropic_billing_error"
      | "anthropic_schema_error",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignGenerationError";
  }
}

function visualDirection(
  template: CampaignSpec["templates"]["carouselCover"],
): string {
  if (template === "cover-32") {
    return "Figma 표지 32의 흑백 사진 위에 흰색 타이포와 보라색 강조를 사용합니다.";
  }
  if (template === "cover-34") {
    return "Figma 표지 34의 사진 위에 흰색 타이포와 보라색 강조를 사용합니다.";
  }
  return "Figma 표지 31의 흰 바탕, 검은 타이포와 보라색 강조를 사용합니다.";
}

export function applyServerOwnedCampaignFields(
  candidate: unknown,
  model: string,
  generatedAt: Date,
): CampaignSpec {
  const parsed = anthropicCampaignCopySchema.parse(candidate);
  const colors = BRAND_COLORS[parsed.brandTone];

  return campaignSpecSchema.parse({
    schemaVersion: "2",
    generation: {
      promptVersion: CAMPAIGN_PROMPT_VERSION,
      model,
      generatedAt: generatedAt.toISOString(),
    },
    project: {
      name: parsed.projectName,
      oneLiner: parsed.projectOneLiner,
      category: parsed.projectCategory,
      language: "ko",
    },
    validation: {
      customer: parsed.validationCustomer,
      problem: parsed.validationProblem,
      solution: parsed.validationSolution,
      expectedSignal: parsed.validationExpectedSignal,
      invalidationEvidence: parsed.validationInvalidationEvidence,
      assumptions: parsed.validationAssumptions,
      signal: {
        type: parsed.signalType,
        ctaLabel: parsed.signalCtaLabel,
        question: parsed.signalQuestion,
        options: (["positive", "neutral", "negative"] as const).map((id, index) => ({
          id,
          label: parsed.signalOptionLabels[index],
        })),
        successMessage: parsed.signalSuccessMessage,
      },
      decisionRule: FIXED_DECISION_RULE,
    },
    brand: {
      tone: parsed.brandTone,
      ...colors,
      visualDirection: visualDirection(parsed.carouselCoverTemplate),
    },
    templates: {
      carouselCover: parsed.carouselCoverTemplate,
      landingIntro: parsed.landingIntroTemplate,
    },
    messaging: {
      valueProposition: parsed.valueProposition,
      hooks: parsed.hooks,
      caption: parsed.socialCaption,
      hashtags: parsed.hashtags,
    },
    landing: {
      seoTitle: parsed.landingSeoTitle,
      hero: {
        eyebrow: parsed.landingHeroEyebrow,
        supportingText: parsed.landingHeroSupportingText,
      },
      painPoints: parsed.landingPainPoints,
      benefits: parsed.landingBenefits,
      steps: parsed.landingSteps,
      faq: parsed.landingFaq,
    },
    carousel: {
      hookBody: parsed.carouselHookBody,
      problem: {
        headline: parsed.carouselProblemHeadline,
        body: parsed.carouselProblemBody,
      },
      insight: {
        headline: parsed.carouselInsightHeadline,
        body: parsed.carouselInsightBody,
      },
      solutionBody: parsed.carouselSolutionBody,
      ctaBody: parsed.carouselCtaBody,
      visualPrompts: parsed.carouselVisualPrompts,
    },
    safety: {
      claimsToReview: parsed.claimsToReview,
      prohibitedClaimsRemoved: parsed.prohibitedClaimsRemoved,
    },
  });
}

export class AnthropicCampaignGenerator implements CampaignGenerator {
  private readonly client: AnthropicMessagesClient;
  private readonly model: string;
  private readonly now: () => Date;

  constructor(options: AnthropicCampaignGeneratorOptions) {
    this.model = options.model;
    this.now = options.now ?? (() => new Date());
    const createClient = options.createClient ?? ((config) => new Anthropic(config));
    this.client = options.client ?? createClient({
      apiKey: options.apiKey,
      maxRetries: ANTHROPIC_REQUEST_POLICY.maxRetries,
      timeout: ANTHROPIC_REQUEST_POLICY.timeoutMs,
    });
  }

  async generate(input: IdeaInput): Promise<CampaignSpec> {
    const parsedInput = ideaInputSchema.parse(input);

    try {
      const request = {
        model: this.model,
        system: buildCampaignDeveloperPrompt(),
        messages: [
          { role: "user" as const, content: buildCampaignUserPrompt(parsedInput) },
        ],
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        output_config: {
          format: zodOutputFormat(anthropicCampaignCopySchema),
        },
      };

      const response = await this.client.messages.parse(request);
      if (response.parsed_output) {
        return applyServerOwnedCampaignFields(
          response.parsed_output,
          this.model,
          this.now(),
        );
      }

      throw new CampaignGenerationError(
        "anthropic_empty_response",
        "Claude가 검증 가능한 광고 문구를 반환하지 않았습니다.",
      );
    } catch (error) {
      if (error instanceof CampaignGenerationError) throw error;
      const upstreamBody = typeof error === "object" && error !== null && "error" in error
        ? error.error
        : undefined;
      const upstreamError = typeof upstreamBody === "object"
        && upstreamBody !== null
        && "error" in upstreamBody
        ? upstreamBody.error
        : undefined;
      if (
        typeof error === "object"
        && error !== null
        && "status" in error
        && error.status === 400
        && typeof upstreamError === "object"
        && upstreamError !== null
        && "type" in upstreamError
        && upstreamError.type === "invalid_request_error"
        && "message" in upstreamError
        && typeof upstreamError.message === "string"
        && upstreamError.message.includes("compiled grammar")
      ) {
        throw new CampaignGenerationError(
          "anthropic_schema_error",
          "Anthropic 구조화 출력 스키마를 컴파일하지 못했습니다.",
          { cause: error },
        );
      }
      if (
        typeof error === "object"
        && error !== null
        && (("status" in error && error.status === 402)
          || ("type" in error && error.type === "billing_error"))
      ) {
        throw new CampaignGenerationError(
          "anthropic_billing_error",
          "Anthropic API 결제 상태를 확인해주세요.",
          { cause: error },
        );
      }
      throw new CampaignGenerationError(
        "anthropic_request_failed",
        "Claude 문구 생성 요청을 완료하지 못했습니다.",
        { cause: error },
      );
    }
  }
}
