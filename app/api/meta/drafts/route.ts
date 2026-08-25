import type { CampaignRepository, PublishedCampaign } from "@/lib/contracts/repository";
import type { MetaDraftCompletedResponse } from "@/lib/contracts/metaDraft";
import { getCampaignRepository } from "@/lib/demo/repository";
import { requireVerifiedIdentity } from "@/lib/auth/authorization";
import { isSameOriginMutation, resolveAppOrigin } from "@/lib/auth/security";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  META_MAX_TOTAL_IMAGE_BYTES,
  META_REQUIRED_IMAGE_COUNT,
  MetaConfigurationError,
  MetaInputError,
  type MetaPngAsset,
  validateMetaPngAssets,
} from "@/lib/meta/contracts";
import { deriveMetaPausedDraftInput } from "@/lib/meta/campaignDraftInput";
import {
  assertMetaAdsLiveEnvironment,
  createGraphMetaAdsProviderFromEnvironment,
  isMetaDraftOperator,
  readMetaAdsMode,
  readMetaConfiguredBinding,
  readMetaPausedDraftServerPolicy,
  type MetaPausedDraftServerPolicy,
} from "@/lib/meta/metaConfig";
import {
  MetaOperationBusyError,
  MetaOperationConflictError,
  MetaOperationLedgerUnavailableError,
  MetaOperationNeedsReconciliationError,
  MetaOperationQuotaExceededError,
  type MetaOperationResult,
} from "@/lib/meta/operationLedger";
import {
  type MetaOperationRpcClient,
  SupabaseMetaOperationLedger,
} from "@/lib/meta/supabaseMetaOperationLedger";
import { PausedCarouselDraftService } from "@/lib/meta/pausedCarouselDraftService";
import {
  ApiRequestError,
  jsonResponse,
  routeErrorResponse,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const META_MAX_MULTIPART_BYTES = META_MAX_TOTAL_IMAGE_BYTES + 128 * 1024;

type Environment = Record<string, string | undefined>;
type DraftCreator = { create(input: Parameters<PausedCarouselDraftService["create"]>[0]): Promise<MetaOperationResult> };

export type MetaDraftRouteDependencies = {
  environment: Environment;
  requireIdentity: () => Promise<{ userId: string }>;
  getOwnerRepository: (environment: Environment) => Promise<CampaignRepository>;
  createDraftCreator: (options: {
    environment: Environment;
    ownerId: string;
    campaignId: string;
    policy: MetaPausedDraftServerPolicy;
  }) => DraftCreator;
  parseFormData: (request: Request) => Promise<FormData>;
  now: () => Date;
};

const defaultDependencies: MetaDraftRouteDependencies = {
  environment: process.env,
  requireIdentity: requireVerifiedIdentity,
  getOwnerRepository: (environment) => getCampaignRepository("owner", environment),
  createDraftCreator: ({ environment, ownerId, campaignId, policy }) => {
    const binding = readMetaConfiguredBinding(environment);
    return new PausedCarouselDraftService(
      createGraphMetaAdsProviderFromEnvironment(environment),
      new SupabaseMetaOperationLedger({
        client: createSupabaseServiceClient(environment) as unknown as MetaOperationRpcClient,
        ownerId,
        campaignId,
        dailyOwnerLimit: policy.dailyOwnerLimit,
        dailyGlobalLimit: policy.dailyGlobalLimit,
      }),
      binding,
    );
  },
  parseFormData: (request) => request.formData(),
  now: () => new Date(),
};

function requireMultipartEnvelope(request: Request): void {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data;\s*boundary=(?:"[^"]{1,70}"|[A-Za-z0-9'()+_,\-./:=?]{1,70})$/iu.test(contentType)) {
    throw new ApiRequestError(415, "unsupported_media_type", "multipart/form-data 요청만 허용합니다.");
  }
  if (request.headers.has("transfer-encoding") || request.headers.has("content-encoding")) {
    throw new ApiRequestError(400, "invalid_multipart_envelope", "인코딩된 multipart 요청은 허용하지 않습니다.");
  }
  // Browsers cannot set Content-Length. Live deployment must preserve the hosting
  // proxy's authoritative single value; missing, duplicated/comma-joined, or encoded
  // envelopes fail before request.formData() can buffer the body.
  const rawLength = request.headers.get("content-length")?.trim() ?? "";
  if (!/^[1-9]\d{0,8}$/u.test(rawLength)) {
    throw new ApiRequestError(411, "content_length_required", "신뢰할 수 있는 Content-Length가 필요합니다.");
  }
  const contentLength = Number(rawLength);
  if (contentLength > META_MAX_MULTIPART_BYTES) {
    throw new ApiRequestError(413, "payload_too_large", "Meta PNG 요청 본문이 너무 큽니다.");
  }
}

function requireCampaignId(value: FormDataEntryValue): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new ApiRequestError(400, "invalid_campaign_id", "광고 ID가 올바르지 않습니다.");
  }
  return value;
}

async function parseExactMultipart(
  formData: FormData,
): Promise<{ campaignId: string; images: MetaPngAsset[] }> {
  const expectedFields = new Set([
    "campaignId",
    ...Array.from({ length: META_REQUIRED_IMAGE_COUNT }, (_, index) => `image${index}`),
  ]);
  const values = new Map<string, FormDataEntryValue[]>();
  for (const [name, value] of formData.entries()) {
    if (!expectedFields.has(name)) {
      throw new ApiRequestError(400, "unexpected_multipart_field", "허용되지 않은 Meta 요청 필드가 있습니다.");
    }
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  for (const name of expectedFields) {
    if (values.get(name)?.length !== 1) {
      throw new ApiRequestError(400, "invalid_multipart_fields", "campaignId와 PNG 5장을 각각 한 번씩 보내야 합니다.");
    }
  }

  const campaignId = requireCampaignId(values.get("campaignId")![0]);
  const images = await Promise.all(Array.from({ length: META_REQUIRED_IMAGE_COUNT }, async (_, index) => {
    const value = values.get(`image${index}`)![0];
    if (!(value instanceof File) || value.type !== "image/png") {
      throw new ApiRequestError(415, "invalid_png_content_type", "Meta 이미지는 PNG 파일이어야 합니다.");
    }
    return {
      filename: `0${index + 1}-card.png`,
      contentType: "image/png" as const,
      bytes: new Uint8Array(await value.arrayBuffer()),
    };
  }));
  validateMetaPngAssets(images);
  return { campaignId, images };
}

function metaRouteErrorResponse(error: unknown): Response {
  if (error instanceof MetaOperationNeedsReconciliationError) {
    return jsonResponse({
      state: "reconciliation_required",
      operationKey: error.operationKey,
      step: error.step,
      error: {
        code: "meta_reconciliation_required",
        message: "Ads Manager와 작업 기록을 운영자가 확인해야 합니다. 자동 재시도하지 않습니다.",
      },
    }, { status: 409 });
  }
  if (error instanceof MetaOperationBusyError) {
    return jsonResponse({ error: { code: "meta_operation_busy", message: error.message } }, { status: 409 });
  }
  if (error instanceof MetaOperationQuotaExceededError) {
    return jsonResponse({ error: { code: "meta_quota_exceeded", message: error.message } }, { status: 429 });
  }
  if (error instanceof MetaOperationConflictError) {
    return jsonResponse({ error: { code: "meta_operation_conflict", message: error.message } }, { status: 409 });
  }
  if (error instanceof MetaInputError) {
    return jsonResponse({ error: { code: "invalid_meta_draft", message: error.message } }, { status: 400 });
  }
  if (
    error instanceof MetaConfigurationError ||
    error instanceof MetaOperationLedgerUnavailableError ||
    (error instanceof Error && error.name.startsWith("MetaGraph"))
  ) {
    return jsonResponse({
      error: { code: "meta_draft_unavailable", message: "Meta PAUSED 초안 설정을 확인해주세요." },
    }, { status: 503 });
  }
  return routeErrorResponse(error);
}

function requireCampaign(campaign: PublishedCampaign | null): PublishedCampaign {
  if (!campaign) throw new ApiRequestError(404, "campaign_not_found", "광고를 찾을 수 없습니다.");
  return campaign;
}

function buildAdsManagerUrl(adAccountId: string): string {
  const url = new URL("https://adsmanager.facebook.com/adsmanager/manage/campaigns");
  url.searchParams.set("act", adAccountId);
  return url.toString();
}

export async function handleCreateMetaDraft(
  request: Request,
  dependencies: MetaDraftRouteDependencies = defaultDependencies,
): Promise<Response> {
  try {
    if (readMetaAdsMode(dependencies.environment) !== "live") {
      throw new ApiRequestError(503, "meta_disabled", "Meta PAUSED 초안 기능이 비활성화되어 있습니다.");
    }
    assertMetaAdsLiveEnvironment(dependencies.environment);
    const origin = resolveAppOrigin(request.url, dependencies.environment);
    if (!isSameOriginMutation(request, origin)) {
      throw new ApiRequestError(403, "invalid_origin", "허용되지 않은 Meta 초안 요청입니다.");
    }
    requireMultipartEnvelope(request);
    const identity = await dependencies.requireIdentity();
    if (!isMetaDraftOperator(identity.userId, dependencies.environment)) {
      throw new ApiRequestError(
        403,
        "meta_operator_required",
        "회사 내부 Meta 운영자만 PAUSED 초안을 만들 수 있습니다.",
      );
    }
    const policy = readMetaPausedDraftServerPolicy(
      dependencies.environment,
      dependencies.now(),
    );
    const binding = readMetaConfiguredBinding(dependencies.environment);
    // These bytes remain caller-supplied. The caller is an allowlisted internal operator,
    // and PNG structure/dimensions are validated below, but renderer provenance is not provable.
    const { campaignId, images } = await parseExactMultipart(
      await dependencies.parseFormData(request),
    );
    const repository = await dependencies.getOwnerRepository(dependencies.environment);
    const campaign = requireCampaign(await repository.getById(campaignId));
    const creator = dependencies.createDraftCreator({
      environment: dependencies.environment,
      ownerId: identity.userId,
      campaignId: campaign.id,
      policy,
    });
    const result = await creator.create(deriveMetaPausedDraftInput({
      campaign,
      images,
      destinationOrigin: binding.allowedDestinationOrigins[0],
      policy,
    }));
    const response: MetaDraftCompletedResponse = {
      state: "completed",
      status: "PAUSED",
      operationKey: result.operationKey,
      campaignId: result.campaignId,
      adSetId: result.adSetId,
      creativeId: result.creativeId,
      adId: result.adId,
      adsManagerUrl: buildAdsManagerUrl(binding.adAccountId),
    };
    return jsonResponse(response);
  } catch (error) {
    return metaRouteErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateMetaDraft(request);
}
