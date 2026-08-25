import { z } from "zod";

const shortText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const signalOptionIdSchema = z.enum(["positive", "neutral", "negative"]);

export const signalOptionSchema = z.object({
  id: signalOptionIdSchema,
  label: shortText(80),
}).strict();

export const carouselContentSchema = z.object({
  headline: shortText(28),
  body: shortText(90),
}).strict();

export const carouselCoverTemplateSchema = z.enum([
  "cover-31",
  "cover-32",
  "cover-34",
]);

export const landingIntroTemplateSchema = z.enum([
  "intro-1",
  "intro-2",
  "intro-3",
  "intro-4",
  "intro-5",
  "intro-6",
  "intro-7",
]);

export const campaignSpecSchema = z.object({
  schemaVersion: z.literal("2"),
  generation: z.object({
    promptVersion: shortText(80),
    model: shortText(100),
    generatedAt: z.iso.datetime(),
  }).strict(),
  project: z.object({
    name: shortText(80),
    oneLiner: shortText(120),
    category: shortText(80),
    language: z.literal("ko"),
  }).strict(),
  validation: z.object({
    customer: shortText(180),
    problem: shortText(240),
    solution: shortText(240),
    expectedSignal: shortText(240),
    invalidationEvidence: shortText(240),
    assumptions: z.array(shortText(240)).max(6).refine(
      (items) => new Set(items).size === items.length,
      { message: "검증 가정은 서로 달라야 합니다." },
    ),
    signal: z.object({
      type: z.enum(["problem_confirmation", "solution_interest"]),
      ctaLabel: shortText(40),
      question: shortText(180),
      options: z.tuple([signalOptionSchema, signalOptionSchema, signalOptionSchema])
        .refine((options) => new Set(options.map((option) => option.id)).size === 3, {
          message: "신호 선택지는 positive, neutral, negative를 각각 하나씩 포함해야 합니다.",
        })
        .refine((options) => new Set(options.map((option) => option.label)).size === 3, {
          message: "신호 선택지 문구는 서로 달라야 합니다.",
        }),
      successMessage: shortText(160),
    }).strict(),
    decisionRule: z.object({
      minimumResponses: z.number().int().min(1).max(1000),
      minimumPositiveResponses: z.number().int().min(1).max(1000),
      description: shortText(160),
    }).strict().refine(
      (rule) => rule.minimumPositiveResponses <= rule.minimumResponses,
      { message: "긍정 응답 기준은 최소 응답 수보다 클 수 없습니다." },
    ),
  }).strict(),
  brand: z.object({
    tone: z.enum(["trust", "bold", "warm"]),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "6자리 HEX 색상이어야 합니다."),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "6자리 HEX 색상이어야 합니다."),
    visualDirection: shortText(240),
  }).strict(),
  templates: z.object({
    carouselCover: carouselCoverTemplateSchema,
    landingIntro: landingIntroTemplateSchema,
  }).strict(),
  messaging: z.object({
    valueProposition: shortText(40),
    hooks: z.tuple([shortText(70), shortText(70), shortText(70)]).refine(
      (items) => new Set(items).size === items.length,
      { message: "후킹 문구 3개는 서로 달라야 합니다." },
    ),
    caption: shortText(1_200),
    hashtags: z.array(shortText(60)).min(1).max(12).refine(
      (items) => new Set(items).size === items.length,
      { message: "해시태그는 중복될 수 없습니다." },
    ),
  }).strict(),
  landing: z.object({
    seoTitle: shortText(100),
    hero: z.object({
      eyebrow: shortText(60),
      supportingText: shortText(180),
    }).strict(),
    painPoints: z.array(z.object({ title: shortText(28), body: shortText(90) }).strict()).length(3).refine(
      (items) => new Set(items.map((item) => item.title)).size === items.length,
      { message: "문제 카드 제목은 서로 달라야 합니다." },
    ),
    benefits: z.array(z.object({ title: shortText(28), body: shortText(90) }).strict()).length(3).refine(
      (items) => new Set(items.map((item) => item.title)).size === items.length,
      { message: "가치 카드 제목은 서로 달라야 합니다." },
    ),
    steps: z.array(z.object({ title: shortText(28), body: shortText(90) }).strict()).length(3).refine(
      (items) => new Set(items.map((item) => item.title)).size === items.length,
      { message: "작동 단계 제목은 서로 달라야 합니다." },
    ),
    faq: z.array(z.object({ question: shortText(100), answer: shortText(240) }).strict()).length(3).refine(
      (items) => new Set(items.map((item) => item.question)).size === items.length,
      { message: "FAQ 질문은 서로 달라야 합니다." },
    ),
  }).strict(),
  carousel: z.object({
    hookBody: shortText(180),
    problem: carouselContentSchema,
    insight: carouselContentSchema,
    solutionBody: shortText(180),
    ctaBody: shortText(180),
    visualPrompts: z.tuple([
      shortText(300), shortText(300), shortText(300), shortText(300), shortText(300),
    ]),
  }).strict(),
  safety: z.object({
    claimsToReview: z.array(shortText(240)).max(8),
    prohibitedClaimsRemoved: z.array(shortText(240)).max(8),
  }).strict(),
}).strict();

export type CampaignSpec = z.infer<typeof campaignSpecSchema>;
export type SignalOption = z.infer<typeof signalOptionSchema>;
export type SignalOptionId = z.infer<typeof signalOptionIdSchema>;
export type CarouselContent = z.infer<typeof carouselContentSchema>;
export type CarouselCoverTemplate = z.infer<typeof carouselCoverTemplateSchema>;
export type LandingIntroTemplate = z.infer<typeof landingIntroTemplateSchema>;

export const nextActionSchema = z.enum(["continue", "revise", "pause"]);
export type NextAction = z.infer<typeof nextActionSchema>;
