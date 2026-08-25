export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-4o-mini";

export type CampaignGeneratorMode = "fixture" | "openai";

export type CampaignGeneratorStatus =
  | { mode: "fixture"; ready: true }
  | { mode: "openai"; ready: boolean };

type Environment = Record<string, string | undefined>;

export type CampaignGeneratorConfig =
  | { mode: "fixture" }
  | {
    mode: "openai";
    apiKey: string;
    model: string;
  };

export class CampaignGeneratorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignGeneratorConfigError";
  }
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveCampaignGeneratorMode(
  environment: Environment = process.env,
): CampaignGeneratorMode {
  const mode = optionalValue(environment.CAMPAIGN_GENERATOR_MODE) ?? "openai";

  if (mode !== "fixture" && mode !== "openai") {
    throw new CampaignGeneratorConfigError(
      "CAMPAIGN_GENERATOR_MODE는 fixture 또는 openai여야 합니다.",
    );
  }

  return mode;
}

export function resolveCampaignGeneratorStatus(
  environment: Environment = process.env,
): CampaignGeneratorStatus {
  const mode = resolveCampaignGeneratorMode(environment);
  if (mode === "fixture") return { mode, ready: true };

  return {
    mode,
    ready: optionalValue(environment.OPENAI_API_KEY) !== undefined,
  };
}

export function resolveCampaignGeneratorConfig(
  environment: Environment = process.env,
): CampaignGeneratorConfig {
  const mode = resolveCampaignGeneratorMode(environment);

  if (mode === "fixture") return { mode };

  const apiKey = optionalValue(environment.OPENAI_API_KEY);
  if (!apiKey) {
    throw new CampaignGeneratorConfigError(
      "openai 모드에는 서버 전용 OPENAI_API_KEY가 필요합니다.",
    );
  }

  return {
    mode,
    apiKey,
    model: optionalValue(environment.OPENAI_TEXT_MODEL) ?? DEFAULT_OPENAI_TEXT_MODEL,
  };
}
