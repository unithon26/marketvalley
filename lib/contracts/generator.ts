import type { CampaignSpec } from "@/lib/contracts/campaign";

export type IdeaInput = {
  background: string;
  solution: string;
};

export interface CampaignGenerator {
  generate(input: IdeaInput): Promise<CampaignSpec>;
}
