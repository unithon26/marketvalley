import { recordSignalRequestSchema, type RecordSignalResponse } from "@/lib/contracts/api";
import { DuplicateSignalError } from "@/lib/contracts/repository";
import { campaignRepository } from "@/lib/demo/repository";
import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";

export const runtime = "nodejs";

function isDuplicateSignalError(error: unknown): boolean {
  return error instanceof DuplicateSignalError
    || (error instanceof Error && error.name === "DuplicateSignalError");
}

export async function POST(request: Request): Promise<Response> {
  let campaignId: string | null = null;

  try {
    const input = recordSignalRequestSchema.parse(await readJsonBody(request, 8_192));
    campaignId = input.campaignId;
    const summary = await campaignRepository.recordSignal(input);
    const response: RecordSignalResponse = { alreadyResponded: false, summary };
    return jsonResponse(response, { status: 201 });
  } catch (error) {
    if (isDuplicateSignalError(error) && campaignId) {
      const response: RecordSignalResponse = {
        alreadyResponded: true,
        summary: await campaignRepository.getSignalSummary(campaignId),
      };
      return jsonResponse(response, { status: 409 });
    }
    return routeErrorResponse(error);
  }
}
