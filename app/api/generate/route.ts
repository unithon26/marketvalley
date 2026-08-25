import type { GenerateCampaignResponse } from "@/lib/contracts/api";
import { createCampaignGenerator } from "@/lib/ai/campaignGenerator";
import { consumeGenerationQuota } from "@/lib/ai/generationRateLimit";
import { resolveCampaignGeneratorMode } from "@/lib/ai/generatorConfig";
import { requireVerifiedIdentity } from "@/lib/auth/authorization";
import { isSameOriginMutation, resolveAppOrigin } from "@/lib/auth/security";
import { ideaInputSchema, type CampaignGenerator } from "@/lib/contracts/generator";
import {
  ApiRequestError,
  jsonResponse,
  readJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";

type Environment = Record<string, string | undefined>;

type GenerateCampaignDependencies = {
  environment: Environment;
  createGenerator: (environment: Environment) => CampaignGenerator;
  requireIdentity: () => Promise<{ userId: string }>;
  consumeQuota: (userId: string, environment: Environment) => boolean | Promise<boolean>;
};

const defaultDependencies: GenerateCampaignDependencies = {
  environment: process.env,
  createGenerator: (environment) => createCampaignGenerator(environment),
  requireIdentity: requireVerifiedIdentity,
  consumeQuota: consumeGenerationQuota,
};

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "unsupported_media_type", "JSON 요청만 허용합니다.");
  }
}

export async function handleGenerateCampaign(
  request: Request,
  dependencies: GenerateCampaignDependencies = defaultDependencies,
): Promise<Response> {
  try {
    const mode = resolveCampaignGeneratorMode(dependencies.environment);
    let userId: string | null = null;

    if (mode !== "fixture") {
      requireJsonContentType(request);
      const origin = resolveAppOrigin(request.url, dependencies.environment);
      if (!isSameOriginMutation(request, origin)) {
        throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 문구 생성 요청입니다.");
      }
      userId = (await dependencies.requireIdentity()).userId;
    }

    const input = ideaInputSchema.parse(await readJsonBody(request, 8_192));
    if (userId && !(await dependencies.consumeQuota(userId, dependencies.environment))) {
      throw new ApiRequestError(
        429,
        "generation_rate_limited",
        "AI 문구 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const campaignGenerator = dependencies.createGenerator(dependencies.environment);
    const spec = await campaignGenerator.generate(input);
    const response: GenerateCampaignResponse = { spec };
    return jsonResponse(response);
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleGenerateCampaign(request);
}
