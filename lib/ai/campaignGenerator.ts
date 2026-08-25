import type { CampaignGenerator } from "@/lib/contracts/generator";
import { fixtureCampaignGenerator } from "@/lib/demo/fixtureGenerator";
import {
  resolveCampaignGeneratorConfig,
  type CampaignGeneratorConfig,
} from "@/lib/ai/generatorConfig";
import { AnthropicCampaignGenerator } from "@/lib/ai/anthropicCampaignGenerator";

type Environment = Record<string, string | undefined>;

type CampaignGeneratorDependencies = {
  fixture: CampaignGenerator;
  createAnthropic: (
    config: Extract<CampaignGeneratorConfig, { mode: "anthropic" }>,
  ) => CampaignGenerator;
};

const defaultDependencies: CampaignGeneratorDependencies = {
  fixture: fixtureCampaignGenerator,
  createAnthropic: (config) => new AnthropicCampaignGenerator(config),
};

export function createCampaignGenerator(
  environment: Environment = process.env,
  dependencies: CampaignGeneratorDependencies = defaultDependencies,
): CampaignGenerator {
  const config = resolveCampaignGeneratorConfig(environment);
  if (config.mode === "fixture") return dependencies.fixture;
  return dependencies.createAnthropic(config);
}
