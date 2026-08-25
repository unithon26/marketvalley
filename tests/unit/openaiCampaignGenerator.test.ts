import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { routeErrorResponse } from "@/app/api/_lib/http";
import { createCampaignGenerator } from "@/lib/ai/campaignGenerator";
import {
  DEFAULT_OPENAI_TEXT_MODEL,
  CampaignGeneratorConfigError,
  resolveCampaignGeneratorConfig,
} from "@/lib/ai/generatorConfig";
import {
  CampaignGenerationError,
  OpenAICampaignGenerator,
  type OpenAIResponsesClient,
} from "@/lib/ai/openaiCampaignGenerator";
import type { CampaignGenerator } from "@/lib/contracts/generator";
import { demoCampaign } from "@/lib/demo/demo-campaign";

const idea = {
  background: "고객 문의 내용을 채널마다 다시 쓰느라 실제 상담과 판단에 쓸 시간이 줄어듭니다.",
  solution: "안내온은 한 번 입력한 상품명과 특징으로 랜딩, 카드뉴스와 게시 문구를 함께 구성합니다.",
};

function fakeClient(
  output: unknown,
): { client: OpenAIResponsesClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn().mockResolvedValue({ output_parsed: output });
  return {
    client: {
      responses: { parse } as unknown as OpenAI["responses"],
    },
    parse,
  };
}

describe("campaign generator configuration", () => {
  it("키와 모델이 있어도 명시적으로 켜지 않으면 과금 없는 fixture를 유지한다", () => {
    expect(resolveCampaignGeneratorConfig({
      OPENAI_API_KEY: "test-key-that-must-not-be-used",
      OPENAI_TEXT_MODEL: "paid-model-that-must-not-be-used",
    })).toEqual({ mode: "fixture" });
  });

  it("openai 모드는 키가 있어야 하며 저비용 Structured Outputs 모델을 기본값으로 쓴다", () => {
    expect(() => resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "openai",
    })).toThrow(CampaignGeneratorConfigError);

    expect(resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "openai",
      OPENAI_API_KEY: "test-key",
    })).toEqual({
      mode: "openai",
      apiKey: "test-key",
      model: DEFAULT_OPENAI_TEXT_MODEL,
    });
    expect(DEFAULT_OPENAI_TEXT_MODEL).toBe("gpt-4o-mini");
  });

  it("알 수 없는 모드를 허용하지 않고 fixture와 openai 구현을 명시적으로 선택한다", () => {
    expect(() => resolveCampaignGeneratorConfig({
      CAMPAIGN_GENERATOR_MODE: "auto",
    })).toThrow(CampaignGeneratorConfigError);

    const fixture = { generate: vi.fn() } satisfies CampaignGenerator;
    const openai = { generate: vi.fn() } satisfies CampaignGenerator;
    const createOpenAI = vi.fn(() => openai);
    const dependencies = { fixture, createOpenAI };

    expect(createCampaignGenerator({}, dependencies)).toBe(fixture);
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(createCampaignGenerator({
      CAMPAIGN_GENERATOR_MODE: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_TEXT_MODEL: "explicit-model",
    }, dependencies)).toBe(openai);
    expect(createOpenAI).toHaveBeenCalledWith({
      mode: "openai",
      apiKey: "test-key",
      model: "explicit-model",
    });
  });
});

describe("OpenAICampaignGenerator", () => {
  it("Responses API Structured Outputs 한 번으로 문구를 만들고 서버 필드를 다시 고정한다", async () => {
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
    const generator = new OpenAICampaignGenerator({
      client,
      model: "gpt-4o-mini",
      now: () => new Date("2026-08-25T12:34:56.000Z"),
    });

    const result = await generator.generate(idea);
    const request = parse.mock.calls[0][0];

    expect(parse).toHaveBeenCalledTimes(1);
    expect(request).toMatchObject({
      model: "gpt-4o-mini",
      store: false,
      max_output_tokens: 6_000,
      input: [
        { role: "developer" },
        { role: "user" },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "campaign_spec",
          strict: true,
        },
      },
    });
    expect(request.input[0].content).toContain("시장검증 광고 카피 생성기");
    expect(request.input[1].content).toContain(JSON.stringify(idea.background));
    expect(result.generation).toEqual({
      promptVersion: "campaign-spec-v1",
      model: "gpt-4o-mini",
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
    const emptyGenerator = new OpenAICampaignGenerator({
      client: empty.client,
      model: "gpt-4o-mini",
    });
    await expect(emptyGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "openai_empty_response",
    });
    expect(empty.parse).toHaveBeenCalledTimes(2);

    const parse = vi.fn().mockRejectedValue(new Error("sensitive upstream detail"));
    const failingGenerator = new OpenAICampaignGenerator({
      client: {
        responses: { parse } as unknown as OpenAI["responses"],
      },
      model: "gpt-4o-mini",
    });
    await expect(failingGenerator.generate(idea)).rejects.toMatchObject({
      name: "CampaignGenerationError",
      code: "openai_request_failed",
      message: "OpenAI 문구 생성 요청을 완료하지 못했습니다.",
    });
  });

  it("설정·upstream 오류를 비밀정보 없는 503 응답으로 변환한다", async () => {
    for (const error of [
      new CampaignGeneratorConfigError("secret configuration detail"),
      new CampaignGenerationError("openai_request_failed", "secret upstream detail"),
    ]) {
      const response = routeErrorResponse(error);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(JSON.stringify(body)).not.toContain("secret");
    }
  });
});
