import { recordReservationRequestSchema, type RecordReservationResponse } from "@/lib/contracts/api";
import { DuplicateSignalError } from "@/lib/contracts/repository";
import { getCampaignRepository } from "@/lib/demo/repository";
import {
  ApiRequestError,
  jsonResponse,
  readJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";

function isDuplicateReservationError(error: unknown): boolean {
  return error instanceof DuplicateSignalError
    || (error instanceof Error && error.name === "DuplicateSignalError");
}

function requireSafeReservationRequest(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "unsupported_media_type", "JSON 요청만 허용합니다.");
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 예약 요청입니다.");
    }
    if (originUrl.host !== expectedHost || originUrl.protocol !== expectedProtocol) {
      throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 예약 요청입니다.");
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  let campaignId: string | null = null;

  try {
    requireSafeReservationRequest(request);
    const campaignRepository = await getCampaignRepository("public");
    const input = recordReservationRequestSchema.parse(await readJsonBody(request, 8_192));
    campaignId = input.campaignId;
    await campaignRepository.recordReservation(input);
    const response: RecordReservationResponse = { alreadyReserved: false };
    return jsonResponse(response, { status: 201 });
  } catch (error) {
    if (isDuplicateReservationError(error) && campaignId) {
      const response: RecordReservationResponse = {
        alreadyReserved: true,
      };
      return jsonResponse(response, { status: 409 });
    }
    return routeErrorResponse(error);
  }
}
