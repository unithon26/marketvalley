import type { CampaignGenerator } from "@/lib/contracts/generator";
import { fixtureCampaignGenerator } from "@/lib/demo/fixtureGenerator";
import {
  resolveCampaignGeneratorConfig,
  type CampaignGeneratorConfig,
} from "@/lib/ai/generatorConfig";
import { OpenAICampaignGenerator } from "@/lib/ai/openaiCampaignGenerator";

type Environment = Record<string, string | undefined>;

type CampaignGeneratorDependencies = {
  fixture: CampaignGenerator;
  createOpenAI: (
    config: Extract<CampaignGeneratorConfig, { mode: "openai" }>,
  ) => CampaignGenerator;
};

const defaultDependencies: CampaignGeneratorDependencies = {
  fixture: fixtureCampaignGenerator,
  createOpenAI: (config) => new OpenAICampaignGenerator(config),
};

export function createCampaignGenerator(
  environment: Environment = process.env,
  dependencies: CampaignGeneratorDependencies = defaultDependencies,
): CampaignGenerator {
  const config = resolveCampaignGeneratorConfig(environment);
  if (config.mode === "fixture") return dependencies.fixture;
  return dependencies.createOpenAI(config);
}
