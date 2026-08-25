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
  type CampaignGenerationOptions,
  type CampaignGenerator,
  type IdeaInput,
} from "@/lib/contracts/generator";
import {
  buildCampaignDeveloperPrompt,
  buildCampaignUserPrompt,
  CAMPAIGN_PROMPT_VERSION,
} from "@/lib/ai/campaignPrompts";

export const ANTHROPIC_REQUEST_POLICY = {
  timeoutMs: 90_000,
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

const FIXED_INVALIDATION_EVIDENCE =
  "예약이 충분히 모이지 않거나 반복 사용 의사가 확인되지 않으면 고객·문제·메시지 가설을 다시 검토합니다.";

const PROHIBITED_PUBLIC_CLAIM_PATTERN = /(?:수강생|사용자|고객)\s*(?:\d+(?:[.,]\d+)?\s*(?:만|천|백)?|[일이삼사오육칠팔구십백천만억]+)\s*명|만족도\s*(?:\d|[일이삼사오육칠팔구십백천만억])|매출[^.\n]{0,20}(?:\d|증가|향상|보장)|(?:성과|효과|효능|결과|수익)[^.\n]{0,20}(?:보장|입증)|(?:업계|시장)\s*1위|검증\s*(?:완료|됐다|되었습니다)|(?:수상|인증)\s*(?:완료|받|획득)|(?:반드시|무조건)[^.\n]{0,20}(?:성공|매출|효과|성과)|(?:시간|낭비|폐기)[^.\n]{0,20}(?:줄|감소|절약)|(?:관심\s*)?고객[^.\n]{0,20}(?:확보|증가|늘)|수월|효율(?:화|적|성)?|신뢰(?:감)?[^.\n]{0,12}(?:높|제공)/u;

const INPUT_GROUNDED_TERMS = [
  "가격",
  "할인",
  "환불",
  "배송",
  "지원팀",
  "카톡",
  "카카오톡",
  "인스타그램",
  "네이버",
  "블로그",
  "웹사이트",
  "SNS",
  "메신저",
  "개인정보 처리 방침",
  "혼동",
  "누락",
  "실수",
  "오류",
  "불일치",
  "맞지 않",
] as const;

const CHANNEL_TERMS = [
  "카카오톡",
  "카톡",
  "인스타그램",
  "네이버",
  "블로그",
  "웹사이트",
  "SNS",
  "메신저",
] as const;

const PROHIBITED_CLAIM_GROUNDING_TERMS = [
  "수강생",
  "사용자 수",
  "고객 수",
  "만족도",
  "매출",
  "보장",
  "1위",
  "수상",
  "인증",
  "효능",
  "후기",
  "검증 완료",
] as const;

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
      | "anthropic_schema_error"
      | "anthropic_unsafe_output",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignGenerationError";
  }
}

function shortenGeneratedText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length <= maximum) return normalized;

  let bounded = "";
  for (const character of normalized) {
    if ((bounded + character).length > maximum) break;
    bounded += character;
  }

  const minimumBoundary = Math.floor(maximum * 0.65);
  const punctuationBoundary = Math.max(
    bounded.lastIndexOf("."),
    bounded.lastIndexOf("!"),
    bounded.lastIndexOf("?"),
    bounded.lastIndexOf(","),
  );
  const whitespaceBoundary = bounded.lastIndexOf(" ");
  const naturalBoundary = Math.max(punctuationBoundary + 1, whitespaceBoundary);
  if (naturalBoundary >= minimumBoundary) {
    bounded = bounded.slice(0, naturalBoundary);
  }

  const cleaned = bounded.replace(/[,:;·/(\-]+$/u, "").trim();
  return cleaned || bounded.trim();
}

function readPath(root: unknown, path: readonly PropertyKey[]): unknown {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

function writePath(root: unknown, path: readonly PropertyKey[], value: unknown): boolean {
  if (path.length === 0) return false;
  const parent = readPath(root, path.slice(0, -1));
  if (!parent || typeof parent !== "object") return false;
  return Reflect.set(parent, path.at(-1)!, value);
}

export function normalizeAnthropicCopyCandidate(candidate: unknown) {
  const normalized = structuredClone(candidate);

  for (let pass = 0; pass < 3; pass += 1) {
    const parsed = anthropicCampaignCopySchema.safeParse(normalized);
    if (parsed.success) return parsed.data;

    let changed = false;
    for (const issue of parsed.error.issues) {
      if (
        issue.code === "too_big"
        && issue.origin === "string"
        && typeof issue.maximum === "number"
      ) {
        const value = readPath(normalized, issue.path);
        if (typeof value === "string") {
          changed = writePath(
            normalized,
            issue.path,
            shortenGeneratedText(value, issue.maximum),
          ) || changed;
        }
      }
    }

    if (!changed) throw parsed.error;
  }

  return anthropicCampaignCopySchema.parse(normalized);
}

function publicCopyGroups(candidate: z.infer<typeof anthropicCampaignCopySchema>) {
  return {
    project: [candidate.projectName, candidate.projectOneLiner, candidate.projectCategory],
    validation: [
      candidate.validationCustomer,
      candidate.validationProblem,
      candidate.validationSolution,
      candidate.validationExpectedSignal,
      ...candidate.validationAssumptions,
    ],
    signal: [
      candidate.signalCtaLabel,
      candidate.signalQuestion,
      ...candidate.signalOptionLabels,
      candidate.signalSuccessMessage,
    ],
    messaging: [
      candidate.valueProposition,
      ...candidate.hooks,
      candidate.socialCaption,
      ...candidate.hashtags,
    ],
    landingHero: [
      candidate.landingSeoTitle,
      candidate.landingHeroEyebrow,
      candidate.landingHeroSupportingText,
    ],
    landingPainPoints: candidate.landingPainPoints.flatMap((item) => [item.title, item.body]),
    landingBenefits: candidate.landingBenefits.flatMap((item) => [item.title, item.body]),
    landingSteps: candidate.landingSteps.flatMap((item) => [item.title, item.body]),
    landingFaq: candidate.landingFaq.flatMap((item) => [item.question, item.answer]),
    carousel: [
      candidate.carouselHookBody,
      candidate.carouselProblemHeadline,
      candidate.carouselProblemBody,
      candidate.carouselInsightHeadline,
      candidate.carouselInsightBody,
      candidate.carouselSolutionBody,
      candidate.carouselCtaBody,
    ],
  } as const;
}

function assertSafePublicCopy(
  candidate: z.infer<typeof anthropicCampaignCopySchema>,
  input: IdeaInput,
): void {
  const copyGroups = publicCopyGroups(candidate);
  const publicCopy = Object.values(copyGroups).flat().join("\n");
  const source = `${input.background}\n${input.solution}`;
  const ungroundedTerm = INPUT_GROUNDED_TERMS.find(
    (term) => publicCopy.includes(term) && !source.includes(term),
  );
  const ungroundedGroup = ungroundedTerm
    ? Object.entries(copyGroups).find(([, values]) => (
      values.some((value) => value.includes(ungroundedTerm))
    ))?.[0]
    : undefined;
  const hasProhibitedClaim = PROHIBITED_PUBLIC_CLAIM_PATTERN.test(publicCopy);
  if (hasProhibitedClaim || ungroundedTerm) {
    throw new CampaignGenerationError(
      "anthropic_unsafe_output",
      "Claude 출력에 공개할 수 없는 미확인 주장이 포함됐습니다.",
      {
        cause: new Error(
          ungroundedTerm
            ? `ungrounded_term:${ungroundedTerm}:${ungroundedGroup ?? "unknown"}`
            : "prohibited_claim",
        ),
      },
    );
  }
}

function removeUngroundedHashtags(
  candidate: z.infer<typeof anthropicCampaignCopySchema>,
  input: IdeaInput,
): z.infer<typeof anthropicCampaignCopySchema> {
  const source = `${input.background}\n${input.solution}`;
  const normalizeHashtag = (value: string): string | null => {
    const content = value.replace(/^#+/u, "").replaceAll(/\s+/gu, "");
    if (!content) return null;

    let normalized = "#";
    for (const character of content) {
      if ((normalized + character).length > 60) break;
      normalized += character;
    }
    return normalized.length > 1 ? normalized : null;
  };
  const hashtags = Array.from(new Set(candidate.hashtags
    .filter((hashtag) => !INPUT_GROUNDED_TERMS.some(
      (term) => hashtag.includes(term) && !source.includes(term),
    ))
    .map(normalizeHashtag)
    .filter((hashtag): hashtag is string => hashtag !== null)));
  const fallback = normalizeHashtag(candidate.projectName) ?? "#시장검증";
  return {
    ...candidate,
    hashtags: hashtags.length > 0 ? hashtags : [fallback],
  };
}

function removeInventedProhibitedClaims(
  candidate: z.infer<typeof anthropicCampaignCopySchema>,
  input: IdeaInput,
): z.infer<typeof anthropicCampaignCopySchema> {
  const source = `${input.background}\n${input.solution}`;
  return {
    ...candidate,
    prohibitedClaimsRemoved: candidate.prohibitedClaimsRemoved.filter((claim) => {
      const mentionedTerms = PROHIBITED_CLAIM_GROUNDING_TERMS.filter((term) => (
        claim.includes(term)
      ));
      const numericClaims = claim.match(/\d+(?:[.,]\d+)?\s*(?:만|천|백|%|퍼센트|명|원|시간|분|일|주|개월|년)?/gu) ?? [];
      return mentionedTerms.length > 0
        && mentionedTerms.every((term) => source.includes(term))
        && numericClaims.every((value) => source.includes(value));
    }),
  };
}

const SAFE_FAQ_FALLBACKS = [
  {
    question: "사전예약이 구매를 보장하나요?",
    answer: "아니요. 사전예약은 관심 표현이며 실제 구매나 결과가 확정되는 것은 아닙니다. 운영자가 예약자명단을 확인한 뒤 다음 안내를 직접 전달합니다.",
  },
  {
    question: "이름과 이메일은 어떻게 사용되나요?",
    answer: "이름과 이메일은 명시적 동의 후 예약자명단 확인 목적으로만 저장됩니다.",
  },
  {
    question: "다음 안내는 누가 전달하나요?",
    answer: "운영자가 예약자명단을 확인하고 다음 행동을 판단한 뒤 직접 안내합니다.",
  },
] as const;

function replaceUngroundedFaq(
  candidate: z.infer<typeof anthropicCampaignCopySchema>,
  input: IdeaInput,
): z.infer<typeof anthropicCampaignCopySchema> {
  const source = `${input.background}\n${input.solution}`;
  const faq = candidate.landingFaq.map((item) => ({ ...item }));
  const unsafeIndexes = faq.flatMap((item, index) => (
    INPUT_GROUNDED_TERMS.some((term) => (
      `${item.question}\n${item.answer}`.includes(term) && !source.includes(term)
    )) ? [index] : []
  ));
  const reservedQuestions = new Set(
    faq.filter((_, index) => !unsafeIndexes.includes(index)).map((item) => item.question),
  );
  for (const index of unsafeIndexes) {
    const fallback = SAFE_FAQ_FALLBACKS.find(
      (item) => !reservedQuestions.has(item.question),
    ) ?? SAFE_FAQ_FALLBACKS[index % SAFE_FAQ_FALLBACKS.length];
    faq[index] = { ...fallback };
    reservedQuestions.add(fallback.question);
  }
  return { ...candidate, landingFaq: faq };
}

function replaceUngroundedChannels(value: unknown, input: IdeaInput): unknown {
  const source = `${input.background}\n${input.solution}`;
  const ungroundedChannels = CHANNEL_TERMS.filter((term) => !source.includes(term));
  if (typeof value === "string") {
    const replaced = ungroundedChannels.reduce(
      (result, term) => result.replaceAll(term, "여러 채널"),
      value,
    );
    return replaced
      .replace(
        /여러 채널(?:\s*[,·]\s*여러 채널|\s*(?:과|와|등)\s*여러 채널)+/gu,
        "여러 채널",
      )
      .replace(/여러 채널\s*등\s*여러 곳/gu, "여러 채널");
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceUngroundedChannels(item, input));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      replaceUngroundedChannels(item, input),
    ]));
  }
  return value;
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
  input: IdeaInput,
  model: string,
  generatedAt: Date,
): CampaignSpec {
  const parsed = removeUngroundedHashtags(
    replaceUngroundedFaq(
      removeInventedProhibitedClaims(
        normalizeAnthropicCopyCandidate(replaceUngroundedChannels(candidate, input)),
        input,
      ),
      input,
    ),
    input,
  );
  assertSafePublicCopy(parsed, input);
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
      invalidationEvidence: FIXED_INVALIDATION_EVIDENCE,
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

  async generate(input: IdeaInput, options?: CampaignGenerationOptions): Promise<CampaignSpec> {
    const parsedInput = ideaInputSchema.parse(input);

    try {
      const request = {
        model: this.model,
        system: buildCampaignDeveloperPrompt(),
        messages: [
          { role: "user" as const, content: buildCampaignUserPrompt(parsedInput) },
        ],
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        temperature: 0,
        output_config: {
          format: zodOutputFormat(anthropicCampaignCopySchema),
        },
      };

      const response = await this.client.messages.create(request, { signal: options?.signal });
      const textBlock = response.content.find((block) => block.type === "text");
      if (textBlock) {
        return applyServerOwnedCampaignFields(
          JSON.parse(textBlock.text),
          parsedInput,
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
