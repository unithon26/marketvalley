import { z } from "zod";

import type { ApiErrorResponse } from "@/lib/contracts/api";
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
} from "@/lib/contracts/repository";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readBody(request: Request, maximumBytes: number): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ApiRequestError(413, "payload_too_large", "요청 본문이 너무 큽니다.");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new ApiRequestError(413, "payload_too_large", "요청 본문이 너무 큽니다.");
  }

  return body;
}

export async function readJsonBody(request: Request, maximumBytes = 65_536): Promise<unknown> {
  const body = await readBody(request, maximumBytes);

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiRequestError(400, "invalid_json", "올바른 JSON 요청이 아닙니다.");
  }
}

export async function readOptionalJsonBody(
  request: Request,
  maximumBytes = 65_536,
): Promise<unknown | null> {
  const body = await readBody(request, maximumBytes);
  if (body.trim() === "") return null;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiRequestError(400, "invalid_json", "올바른 JSON 요청이 아닙니다.");
  }
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  issues?: ApiErrorResponse["error"]["issues"],
): Response {
  return jsonResponse({ error: { code, message, ...(issues ? { issues } : {}) } }, { status });
}

function hasErrorName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

export function routeErrorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return errorResponse(
      400,
      "invalid_request",
      "요청 값을 확인해주세요.",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  if (error instanceof ApiRequestError) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof CampaignNotFoundError || hasErrorName(error, "CampaignNotFoundError")) {
    return errorResponse(404, "campaign_not_found", "광고를 찾을 수 없습니다.");
  }
  if (error instanceof DraftConflictError || hasErrorName(error, "DraftConflictError")) {
    return errorResponse(409, "draft_conflict", "이미 다른 내용으로 게시된 광고 초안입니다.");
  }
  if (error instanceof DraftOwnershipError || hasErrorName(error, "DraftOwnershipError")) {
    return errorResponse(403, "draft_mismatch", "이 광고를 변경할 수 없는 초안입니다.");
  }
  if (hasErrorName(error, "CampaignGeneratorConfigError")) {
    return errorResponse(503, "campaign_generator_not_configured", "문구 생성 설정을 확인해주세요.");
  }
  if (hasErrorName(error, "AuthenticationRequiredError")) {
    return errorResponse(401, "authentication_required", "계속하려면 로그인이 필요합니다.");
  }
  if (hasErrorName(error, "SupabaseConfigurationError")) {
    return errorResponse(503, "auth_not_configured", "로그인 설정을 확인해주세요.");
  }
  if (
    hasErrorName(error, "SupabaseServiceConfigError")
    || hasErrorName(error, "CampaignRepositoryConfigError")
    || hasErrorName(error, "GenerationRateLimitConfigError")
  ) {
    return errorResponse(503, "campaign_repository_not_configured", "데이터 저장 설정을 확인해주세요.");
  }
  if (hasErrorName(error, "GenerationRateLimitUnavailableError")) {
    return errorResponse(503, "generation_rate_limit_unavailable", "문구 생성 제한을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (hasErrorName(error, "CampaignGenerationError")) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "anthropic_schema_error"
    ) {
      return errorResponse(503, "campaign_generation_schema_error", "AI 생성 형식 설정을 확인해주세요.");
    }
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "anthropic_billing_error"
    ) {
      return errorResponse(503, "anthropic_billing_error", "AI 생성 결제 상태를 확인해주세요.");
    }
    return errorResponse(503, "campaign_generation_unavailable", "문구를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  return errorResponse(500, "internal_error", "요청을 처리하지 못했습니다.");
}
