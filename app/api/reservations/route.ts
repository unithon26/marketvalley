import { recordReservationRequestSchema, type RecordReservationResponse } from "@/lib/contracts/api";
import {
  CampaignNotFoundError,
  DuplicateSignalError,
  ReservationRateLimitError,
  ReservationStoreUnavailableError,
} from "@/lib/contracts/repository";
import { getCampaignRepository } from "@/lib/demo/repository";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import {
  ApiRequestError,
  jsonResponse,
  readJsonBody,
  routeErrorResponse,
} from "@/app/api/_lib/http";
import { resolveReservationProtectionConfig } from "@/lib/security/reservationProtection";
import {
  ReservationVerificationRejectedError,
  ReservationVerificationUnavailableError,
  verifyReservationTurnstile,
} from "@/lib/security/turnstile";

export const runtime = "nodejs";

type Environment = Record<string, string | undefined>;

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isDuplicateReservationError(error: unknown): boolean {
  return error instanceof DuplicateSignalError
    || (error instanceof Error && error.name === "DuplicateSignalError");
}

function requireSafeReservationRequest(request: Request, expectedOrigin?: string): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "unsupported_media_type", "JSON 요청만 허용합니다.");
  }

  const origin = request.headers.get("origin");
  if (expectedOrigin) {
    if (origin !== expectedOrigin) {
      throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 예약 요청입니다.");
    }
    return;
  }

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

type ReservationRouteDependencies = {
  environment?: Environment;
  repository?: typeof getCampaignRepository;
  verifyTurnstile?: typeof verifyReservationTurnstile;
};

function reservationUnavailableResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "reservation_unavailable",
        message: "예약 접수를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
    },
    { status: 503 },
  );
}

export function createReservationPostHandler(dependencies: ReservationRouteDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const repositoryFactory = dependencies.repository ?? getCampaignRepository;
  const verifier = dependencies.verifyTurnstile ?? verifyReservationTurnstile;

  return async function postReservation(request: Request): Promise<Response> {
    let campaignId: string | null = null;

    try {
      // Reject malformed and cross-origin envelopes before touching provider or
      // repository configuration so hostile requests cannot probe deployment state.
      requireSafeReservationRequest(
        request,
        environment.NEXT_PUBLIC_SITE_URL?.trim() || undefined,
      );
      const input = recordReservationRequestSchema.parse(await readJsonBody(request, 8_192));
      campaignId = input.campaignId;
      const mode = resolveCampaignRepositoryMode(environment);
      const protection = resolveReservationProtectionConfig(mode, environment);
      if (protection.mode === "turnstile") {
        requireSafeReservationRequest(request, protection.origin);
        if (!canonicalUuidPattern.test(input.campaignId)) {
          throw new ApiRequestError(400, "invalid_campaign_id", "캠페인 식별자를 확인해주세요.");
        }
        if (!input.turnstileToken) {
          throw new ApiRequestError(400, "turnstile_required", "자동 제출 방지 확인이 필요합니다.");
        }
        await verifier(input.turnstileToken, protection);
      }
      const campaignRepository = await repositoryFactory("public", environment);
      await campaignRepository.recordReservation(input);
      const response: RecordReservationResponse = { alreadyReserved: false };
      return jsonResponse(response, { status: 201 });
    } catch (error) {
      if (isDuplicateReservationError(error) && campaignId) {
        const response: RecordReservationResponse = { alreadyReserved: true };
        return jsonResponse(response, { status: 409 });
      }
      if (error instanceof ReservationRateLimitError) {
        return jsonResponse(
          {
            error: {
              code: error.reason === "capacity"
                ? "reservation_capacity_reached"
                : "reservation_rate_limited",
              message: "예약 요청이 많습니다. 잠시 후 다시 시도해주세요.",
            },
          },
          { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
        );
      }
      if (
        error instanceof ReservationVerificationRejectedError
        || (error instanceof Error && error.name === "ReservationVerificationRejectedError")
      ) {
        return jsonResponse(
          {
            error: {
              code: "reservation_verification_failed",
              message: "자동 제출 방지 확인을 다시 진행해주세요.",
            },
          },
          { status: 403 },
        );
      }
      if (
        error instanceof ReservationVerificationUnavailableError
        || error instanceof ReservationStoreUnavailableError
        || (error instanceof Error && [
          "ReservationVerificationUnavailableError",
          "ReservationStoreUnavailableError",
        ].includes(error.name))
      ) {
        return reservationUnavailableResponse();
      }
      if (error instanceof CampaignNotFoundError) return routeErrorResponse(error);
      return routeErrorResponse(error);
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  return createReservationPostHandler()(request);
}
