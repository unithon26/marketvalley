import { z } from "zod";

import type { CampaignSpec } from "@/lib/contracts/campaign";

export const ideaInputSchema = z.object({
  background: z.string().trim().min(20).max(600),
  solution: z.string().trim().min(20).max(500),
}).strict();

export type IdeaInput = z.infer<typeof ideaInputSchema>;

export type CampaignGenerationOptions = {
  signal?: AbortSignal;
};

export interface CampaignGenerator {
  generate(input: IdeaInput, options?: CampaignGenerationOptions): Promise<CampaignSpec>;
}
