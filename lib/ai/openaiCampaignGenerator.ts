import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  campaignSpecSchema,
  signalOptionSchema,
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

const OPENAI_TIMEOUT_MS = 20_000;
const OPENAI_MAX_RETRIES = 1;
const OPENAI_MAX_OUTPUT_TOKENS = 6_000;
const OPENAI_EMPTY_RESPONSE_ATTEMPTS = 2;

const uniqueArray = <T extends z.ZodType>(schema: T, length: number, maximum: number) => (
  z.array(schema).length(length).refine(
    (items) => new Set(items.map((item) => JSON.stringify(item))).size === items.length,
    { message: `${length}개 항목은 서로 달라야 합니다.` },
  ).refine(
    (items) => items.every((item) => typeof item !== "string" || item.length <= maximum),
    { message: `각 항목은 ${maximum}자 이하여야 합니다.` },
  )
);

const structuredSignalOptionsSchema = z.array(signalOptionSchema).length(3)
  .refine((options) => new Set(options.map((option) => option.id)).size === 3, {
    message: "신호 선택지는 positive, neutral, negative를 각각 하나씩 포함해야 합니다.",
  })
  .refine((options) => new Set(options.map((option) => option.label)).size === 3, {
    message: "신호 선택지 문구는 서로 달라야 합니다.",
  });

export const openAICampaignSpecSchema = campaignSpecSchema.extend({
  validation: campaignSpecSchema.shape.validation.extend({
    signal: campaignSpecSchema.shape.validation.shape.signal.extend({
      options: structuredSignalOptionsSchema,
    }),
  }),
  messaging: campaignSpecSchema.shape.messaging.extend({
    hooks: uniqueArray(z.string().trim().min(1).max(70), 3, 70),
  }),
  carousel: campaignSpecSchema.shape.carousel.extend({
    visualPrompts: uniqueArray(z.string().trim().min(1).max(300), 5, 300),
  }),
});

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

export type OpenAIResponsesClient = Pick<OpenAI, "responses">;

type OpenAICampaignGeneratorOptions = {
  apiKey?: string;
  model: string;
  client?: OpenAIResponsesClient;
  now?: () => Date;
};

export class CampaignGenerationError extends Error {
  constructor(
    readonly code: "openai_request_failed" | "openai_empty_response",
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
  const parsed = campaignSpecSchema.parse(candidate);
  const optionsById = new Map(
    parsed.validation.signal.options.map((option) => [option.id, option] as const),
  );
  const canonicalOptions = (["positive", "neutral", "negative"] as const).map((id) => ({
    id,
    label: optionsById.get(id)?.label ?? id,
  })) as CampaignSpec["validation"]["signal"]["options"];
  const colors = BRAND_COLORS[parsed.brand.tone];

  return campaignSpecSchema.parse({
    ...parsed,
    schemaVersion: "2",
    generation: {
      promptVersion: CAMPAIGN_PROMPT_VERSION,
      model,
      generatedAt: generatedAt.toISOString(),
    },
    project: {
      ...parsed.project,
      language: "ko",
    },
    validation: {
      ...parsed.validation,
      signal: {
        ...parsed.validation.signal,
        options: canonicalOptions,
      },
      decisionRule: FIXED_DECISION_RULE,
    },
    brand: {
      tone: parsed.brand.tone,
      ...colors,
      visualDirection: visualDirection(parsed.templates.carouselCover),
    },
  });
}

export class OpenAICampaignGenerator implements CampaignGenerator {
  private readonly client: OpenAIResponsesClient;
  private readonly model: string;
  private readonly now: () => Date;

  constructor(options: OpenAICampaignGeneratorOptions) {
    this.model = options.model;
    this.now = options.now ?? (() => new Date());
    this.client = options.client ?? new OpenAI({
      apiKey: options.apiKey,
      maxRetries: OPENAI_MAX_RETRIES,
      timeout: OPENAI_TIMEOUT_MS,
    });
  }

  async generate(input: IdeaInput): Promise<CampaignSpec> {
    const parsedInput = ideaInputSchema.parse(input);

    try {
      const request = {
        model: this.model,
        input: [
          { role: "developer" as const, content: buildCampaignDeveloperPrompt() },
          { role: "user" as const, content: buildCampaignUserPrompt(parsedInput) },
        ],
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        store: false,
        text: {
          format: zodTextFormat(
            openAICampaignSpecSchema,
            "campaign_spec",
            { description: "marketvalley 시장검증 광고 문구 계약" },
          ),
        },
      };

      for (let attempt = 0; attempt < OPENAI_EMPTY_RESPONSE_ATTEMPTS; attempt += 1) {
        const response = await this.client.responses.parse(request);
        if (!response.output_parsed) continue;

        return applyServerOwnedCampaignFields(
          response.output_parsed,
          this.model,
          this.now(),
        );
      }

      throw new CampaignGenerationError(
        "openai_empty_response",
        "OpenAI가 검증 가능한 광고 문구를 반환하지 않았습니다.",
      );
    } catch (error) {
      if (error instanceof CampaignGenerationError) throw error;
      throw new CampaignGenerationError(
        "openai_request_failed",
        "OpenAI 문구 생성 요청을 완료하지 못했습니다.",
        { cause: error },
      );
    }
  }
}
