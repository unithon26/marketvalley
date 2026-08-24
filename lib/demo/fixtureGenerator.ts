import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import {
  ideaInputSchema,
  type CampaignGenerator,
  type IdeaInput,
} from "@/lib/contracts/generator";
import {
  referenceCampaignTemplates,
  type ReferenceCampaignTemplate,
} from "@/lib/demo/demo-campaign";

function keywordScore(text: string, template: ReferenceCampaignTemplate): number {
  return template.keywords.reduce(
    (score, keyword) => score + (text.includes(keyword.toLocaleLowerCase("ko-KR")) ? keyword.length : 0),
    0,
  );
}

export function selectReferenceCampaignTemplate(input: IdeaInput): ReferenceCampaignTemplate {
  const parsedInput = ideaInputSchema.parse(input);
  const text = `${parsedInput.background} ${parsedInput.solution}`.toLocaleLowerCase("ko-KR");

  let selected = referenceCampaignTemplates[0];
  let selectedScore = 0;

  for (const template of referenceCampaignTemplates) {
    const score = keywordScore(text, template);
    if (score > selectedScore) {
      selected = template;
      selectedScore = score;
    }
  }

  return selected;
}

export class FixtureCampaignGenerator implements CampaignGenerator {
  async generate(input: IdeaInput): Promise<CampaignSpec> {
    const template = selectReferenceCampaignTemplate(input);
    return campaignSpecSchema.parse(structuredClone(template.spec));
  }
}

export const fixtureCampaignGenerator = new FixtureCampaignGenerator();
export const campaignGenerator: CampaignGenerator = fixtureCampaignGenerator;
