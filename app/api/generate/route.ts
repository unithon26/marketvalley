import type { GenerateCampaignResponse } from "@/lib/contracts/api";
import { ideaInputSchema } from "@/lib/contracts/generator";
import { campaignGenerator } from "@/lib/demo/fixtureGenerator";
import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = ideaInputSchema.parse(await readJsonBody(request, 8_192));
    const spec = await campaignGenerator.generate(input);
    const response: GenerateCampaignResponse = { spec };
    return jsonResponse(response);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
