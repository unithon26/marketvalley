import { recordReservationRequestSchema, type RecordReservationResponse } from "@/lib/contracts/api";
import { DuplicateSignalError } from "@/lib/contracts/repository";
import { campaignRepository } from "@/lib/demo/repository";
import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";

export const runtime = "nodejs";

function isDuplicateReservationError(error: unknown): boolean {
  return error instanceof DuplicateSignalError
    || (error instanceof Error && error.name === "DuplicateSignalError");
}

export async function POST(request: Request): Promise<Response> {
  let campaignId: string | null = null;

  try {
    const input = recordReservationRequestSchema.parse(await readJsonBody(request, 8_192));
    campaignId = input.campaignId;
    const summary = await campaignRepository.recordReservation(input);
    const response: RecordReservationResponse = { alreadyReserved: false, summary };
    return jsonResponse(response, { status: 201 });
  } catch (error) {
    if (isDuplicateReservationError(error) && campaignId) {
      const response: RecordReservationResponse = {
        alreadyReserved: true,
        summary: await campaignRepository.getReservationSummary(campaignId),
      };
      return jsonResponse(response, { status: 409 });
    }
    return routeErrorResponse(error);
  }
}
