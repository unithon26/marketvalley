export const DEFAULT_ANTHROPIC_TEXT_MODEL = "claude-sonnet-4-6";

export type CampaignGeneratorMode = "fixture" | "anthropic";

export type CampaignGeneratorStatus =
  | { mode: "fixture"; ready: true }
  | { mode: "anthropic"; ready: boolean };

type Environment = Record<string, string | undefined>;

export type CampaignGeneratorConfig =
  | { mode: "fixture" }
  | {
    mode: "anthropic";
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
  const mode = optionalValue(environment.CAMPAIGN_GENERATOR_MODE) ?? "anthropic";

  if (mode !== "fixture" && mode !== "anthropic") {
    throw new CampaignGeneratorConfigError(
      "CAMPAIGN_GENERATOR_MODE는 fixture 또는 anthropic이어야 합니다.",
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
    ready: optionalValue(environment.ANTHROPIC_API_KEY) !== undefined,
  };
}

export function resolveCampaignGeneratorConfig(
  environment: Environment = process.env,
): CampaignGeneratorConfig {
  const mode = resolveCampaignGeneratorMode(environment);

  if (mode === "fixture") return { mode };

  const apiKey = optionalValue(environment.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new CampaignGeneratorConfigError(
      "anthropic 모드에는 서버 전용 ANTHROPIC_API_KEY가 필요합니다.",
    );
  }

  return {
    mode,
    apiKey,
    model: optionalValue(environment.ANTHROPIC_TEXT_MODEL) ?? DEFAULT_ANTHROPIC_TEXT_MODEL,
  };
}
