import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type MetaAdSetPayload,
  type MetaCampaignPayload,
  type MetaCarouselCreativePayload,
  type MetaConfiguredBinding,
  MetaConfigurationError,
  MetaInputError,
  MetaUnsafeStatusError,
  validateMetaPngAsset,
} from "@/lib/meta/contracts";
import {
  GraphMetaAdsProvider,
  MetaGraphApiError,
} from "@/lib/meta/graphMetaAdsProvider";
import {
  assertMetaAdsLiveEnvironment,
  createGraphMetaAdsProviderFromEnvironment,
  isMetaDraftOperator,
  readMetaAdsMode,
  readMetaConfiguredBinding,
  readMetaDraftOperatorUserIds,
  readMetaPageInstagramBindingAttestation,
  readMetaPausedDraftServerPolicy,
} from "@/lib/meta/metaConfig";

const binding: MetaConfiguredBinding = {
  adAccountId: "1234567890",
  pageId: "2345678901",
  instagramActorId: "3456789012",
  allowedDestinationOrigins: ["https://marketvalley.example"],
  maxLifetimeBudgetMinor: 50_000,
};
const accessToken = "test-token-that-must-never-leak-123456789";
const appSecret = "test-app-secret-that-must-never-leak";
const operatorUserId = "11111111-1111-4111-8111-111111111111";
const verifiedPageInstagramBinding = {
  pageId: binding.pageId,
  instagramActorId: binding.instagramActorId,
  verifiedAt: "2026-08-25T12:00:00.000Z",
};

const campaignPayload: MetaCampaignPayload = {
  name: "시장검증 광고",
  status: "PAUSED",
  objective: "OUTCOME_TRAFFIC",
  buyingType: "AUCTION",
  specialAdCategories: [],
};

const adSetPayload: MetaAdSetPayload = {
  name: "시장검증 광고 ad set",
  status: "PAUSED",
  campaignId: "campaign_12345",
  billingEvent: "IMPRESSIONS",
  optimizationGoal: "LINK_CLICKS",
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  lifetimeBudgetMinor: 10_000,
  startsAt: "2026-08-26T01:00:00.000Z",
  endsAt: "2026-08-28T01:00:00.000Z",
  targeting: { countries: ["KR"], ageMin: 20, ageMax: 45 },
};

const creativePayload: MetaCarouselCreativePayload = {
  name: "시장검증 광고 creative",
  destinationUrl: "https://marketvalley.example/p/launch",
  message: "사전예약으로 첫 반응을 확인해 보세요.",
  headline: "첫 반응 확인하기",
  cards: Array.from({ length: 5 }, (_, index) => ({
    headline: `${index + 1}장 제목`,
    description: `${index + 1}장 설명`,
    imageHash: `image_hash_${index}`,
  })),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function crc32(bytes: Iterable<number>): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb8_8320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array | readonly number[]): number[] {
  const typeBytes = Array.from(type, (character) => character.charCodeAt(0));
  const checksum = crc32([...typeBytes, ...data]);
  return [
    ...uint32(data.length),
    ...typeBytes,
    ...data,
    ...uint32(checksum),
  ];
}

const expectedRawBytes = 1_350 * (1 + 1_080 * 4);
let cachedDefaultPng: Uint8Array | null = null;

function png(options: {
  width?: number;
  height?: number;
  includeImageData?: boolean;
  trailingByte?: boolean;
  rawByteLength?: number;
  filterByte?: number;
  invalidZlib?: boolean;
} = {}): Uint8Array {
  if (Object.keys(options).length === 0 && cachedDefaultPng) return cachedDefaultPng;
  const rawScanlines = Buffer.alloc(options.rawByteLength ?? expectedRawBytes);
  if (rawScanlines.byteLength > 0) rawScanlines[0] = options.filterByte ?? 0;
  const imageData = options.invalidZlib
    ? Uint8Array.from([1, 2, 3, 4])
    : deflateSync(rawScanlines);
  const chunks = [
    ...pngChunk("IHDR", [
      ...uint32(options.width ?? 1_080),
      ...uint32(options.height ?? 1_350),
      8, 6, 0, 0, 0,
    ]),
    ...(options.includeImageData === false ? pngChunk("tEXt", [1]) : pngChunk("IDAT", imageData)),
    ...pngChunk("IEND", []),
  ];
  const encoded = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunks,
    ...(options.trailingByte ? [1] : []),
  ]);
  if (Object.keys(options).length === 0) cachedDefaultPng = encoded;
  return encoded;
}

function requestBody(init: RequestInit | undefined): URLSearchParams {
  expect(init?.body).toBeInstanceOf(URLSearchParams);
  return init?.body as URLSearchParams;
}

describe("GraphMetaAdsProvider", () => {
  it("uses Graph v26.0, checks each configured asset is available, and sends PAUSED payloads once", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const responses = [
      { id: "act_1234567890" },
      { id: "2345678901", instagram_business_account: { id: "3456789012" } },
      { data: [{ id: "3456789012" }] },
      { images: { "01-card.png": { hash: "image_hash_0" } } },
      { id: "campaign_12345" },
      { id: "adset_12345" },
      { id: "creative_12345" },
      { id: "ad_12345" },
    ];
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), init });
      return jsonResponse(responses.shift());
    }) as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    await provider.verifyConfiguredAssets();
    await provider.uploadImage({
      filename: "01-card.png",
      contentType: "image/png",
      bytes: png(),
    });
    await provider.createCampaign(campaignPayload);
    await provider.createAdSet(adSetPayload);
    await provider.createCarouselCreative(creativePayload);
    await provider.createAd({
      name: "시장검증 광고 ad",
      status: "PAUSED",
      adSetId: "adset_12345",
      creativeId: "creative_12345",
    });

    expect(requests).toHaveLength(8);
    expect(requests.every(({ url }) => url.pathname.startsWith("/v26.0/"))).toBe(true);
    expect(requests.every(({ url }) => !url.toString().includes(accessToken))).toBe(true);
    expect(requests.every(({ url }) => !url.toString().includes(appSecret))).toBe(true);
    expect(requests.every(({ url }) => url.searchParams.get("appsecret_proof") === (
      createHmac("sha256", appSecret).update(accessToken).digest("hex")
    ))).toBe(true);
    expect(requests.every(({ init }) => new Headers(init?.headers).get("authorization") === `Bearer ${accessToken}`)).toBe(true);
    expect(requests[0].url.pathname).toBe("/v26.0/act_1234567890");
    expect(requests[0].url.searchParams.get("fields")).toBe("id");
    expect(requests[1].url.pathname).toBe("/v26.0/2345678901");
    expect(requests[1].url.searchParams.get("fields"))
      .toBe("id,instagram_business_account{id}");
    expect(requests[2].url.pathname).toBe("/v26.0/act_1234567890/instagram_accounts");
    expect(requests[3].init?.body).toBeInstanceOf(FormData);

    const campaignForm = requestBody(requests[4].init);
    expect(Object.fromEntries(campaignForm)).toMatchObject({
      status: "PAUSED",
      objective: "OUTCOME_TRAFFIC",
      buying_type: "AUCTION",
      special_ad_categories: "[]",
      is_adset_budget_sharing_enabled: "false",
    });
    const adSetForm = requestBody(requests[5].init);
    expect(Object.fromEntries(adSetForm)).toMatchObject({
      status: "PAUSED",
      campaign_id: "campaign_12345",
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      lifetime_budget: "10000",
    });
    expect(JSON.parse(adSetForm.get("targeting") ?? "null")).toEqual({
      age_min: 20,
      age_max: 45,
      geo_locations: { countries: ["KR"], location_types: ["home", "recent"] },
    });
    const creativeForm = requestBody(requests[6].init);
    const story = JSON.parse(creativeForm.get("object_story_spec") ?? "null");
    expect(story).toMatchObject({
      page_id: binding.pageId,
      instagram_user_id: binding.instagramActorId,
      link_data: {
        link: creativePayload.destinationUrl,
        call_to_action: { type: "LEARN_MORE", value: { link: creativePayload.destinationUrl } },
      },
    });
    expect(story.link_data.child_attachments).toHaveLength(5);
    expect(story.link_data.child_attachments.map((card: { image_hash: string }) => card.image_hash))
      .toEqual(creativePayload.cards.map((card) => card.imageHash));
    expect(Object.fromEntries(requestBody(requests[7].init))).toMatchObject({
      status: "PAUSED",
      adset_id: "adset_12345",
      creative: JSON.stringify({ creative_id: "creative_12345" }),
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(8);
  });

  it("rejects every non-PAUSED status before making a request", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    await expect(provider.createCampaign({ ...campaignPayload, status: "ACTIVE" as never }))
      .rejects.toBeInstanceOf(MetaUnsafeStatusError);
    await expect(provider.createAdSet({ ...adSetPayload, status: "ARCHIVED" as never }))
      .rejects.toBeInstanceOf(MetaUnsafeStatusError);
    await expect(provider.createAd({
      name: "unsafe",
      status: "ACTIVE" as never,
      adSetId: "adset_12345",
      creativeId: "creative_12345",
    })).rejects.toBeInstanceOf(MetaUnsafeStatusError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("sanitizes Graph errors and never includes the token or upstream message", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      error: {
        message: `token=${accessToken}`,
        code: 190,
        error_subcode: 463,
        fbtrace_id: "safe_trace_123",
      },
    }, 400)) as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    const error = await provider.createCampaign(campaignPayload).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetaGraphApiError);
    expect(error).toMatchObject({
      httpStatus: 400,
      graphCode: 190,
      graphSubcode: 463,
      traceId: "safe_trace_123",
    });
    expect(String(error)).not.toContain(accessToken);
    expect(String(error)).not.toContain(appSecret);
    expect(String(error)).not.toContain("token=");
  });

  it("fails closed when a configured Instagram asset is unavailable to the ad account", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "act_1234567890" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "2345678901",
        instagram_business_account: { id: "3456789012" },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "9999999999" }] })) as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    await expect(provider.verifyConfiguredAssets()).rejects.toBeInstanceOf(MetaConfigurationError);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the configured Page is unavailable", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "act_1234567890" }))
      .mockResolvedValueOnce(jsonResponse({ id: "9999999999" })) as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    await expect(provider.verifyConfiguredAssets()).rejects.toThrow(
      "설정된 Meta Page를 확인할 수 없습니다.",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the Page points to a different Instagram identity", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "act_1234567890" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "2345678901",
        instagram_business_account: { id: "9999999999" },
      })) as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });

    await expect(provider.verifyConfiguredAssets()).rejects.toThrow(
      "설정된 Meta Page와 Instagram identity의 연결을 확인할 수 없습니다.",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("validates PNG structure and 1080×1350 dimensions again at the Graph boundary", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const provider = new GraphMetaAdsProvider({
      binding, accessToken, appSecret, verifiedPageInstagramBinding, fetchImplementation,
    });
    const base = { filename: "01-card.png", contentType: "image/png" as const };
    const oversizedChunk = png();
    const badChunkBounds = Uint8Array.from(oversizedChunk);
    badChunkBounds.set([0xff, 0xff, 0xff, 0xff], 8);
    const badCrc = Uint8Array.from(png());
    badCrc[badCrc.byteLength - 1] ^= 1;

    expect(() => validateMetaPngAsset({ ...base, bytes: png() })).not.toThrow();
    await expect(provider.uploadImage({ ...base, bytes: png({ width: 1_079 }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: png({ includeImageData: false }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: png({ trailingByte: true }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: badChunkBounds }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: badCrc }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: png({ invalidZlib: true }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: png({ rawByteLength: expectedRawBytes - 1 }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    await expect(provider.uploadImage({ ...base, bytes: png({ filterByte: 5 }) }))
      .rejects.toBeInstanceOf(MetaInputError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("requires every server-side account binding and budget ceiling", () => {
    expect(readMetaConfiguredBinding({
      META_AD_ACCOUNT_ID: binding.adAccountId,
      META_PAGE_ID: binding.pageId,
      META_INSTAGRAM_ACTOR_ID: binding.instagramActorId,
      META_ALLOWED_DESTINATION_ORIGIN: binding.allowedDestinationOrigins[0],
      META_MAX_LIFETIME_BUDGET_MINOR: String(binding.maxLifetimeBudgetMinor),
    })).toEqual(binding);
    expect(() => readMetaConfiguredBinding({
      META_AD_ACCOUNT_ID: binding.adAccountId,
      META_PAGE_ID: binding.pageId,
      META_ALLOWED_DESTINATION_ORIGIN: binding.allowedDestinationOrigins[0],
      META_MAX_LIFETIME_BUDGET_MINOR: String(binding.maxLifetimeBudgetMinor),
    })).toThrow(MetaConfigurationError);
    expect(() => createGraphMetaAdsProviderFromEnvironment({
      META_ADS_MODE: "live",
      NODE_ENV: "production",
      CAMPAIGN_REPOSITORY_MODE: "supabase",
      META_OPERATION_LEDGER_MODE: "supabase",
      META_DRAFT_OPERATOR_USER_IDS: operatorUserId,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      SIGNAL_HASH_SECRET: "signal-hash-secret-at-least-32-bytes-long",
      META_AD_ACCOUNT_ID: binding.adAccountId,
      META_PAGE_ID: binding.pageId,
      META_INSTAGRAM_ACTOR_ID: binding.instagramActorId,
      META_ALLOWED_DESTINATION_ORIGIN: binding.allowedDestinationOrigins[0],
      META_MAX_LIFETIME_BUDGET_MINOR: String(binding.maxLifetimeBudgetMinor),
      META_ACCESS_TOKEN: accessToken,
      META_VERIFIED_PAGE_INSTAGRAM_BINDING: `${binding.pageId}:${binding.instagramActorId}`,
      META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT: verifiedPageInstagramBinding.verifiedAt,
    })).toThrow(MetaConfigurationError);
  });

  it("defaults Meta automation to disabled and permits live only with durable production state", () => {
    expect(readMetaAdsMode({})).toBe("disabled");
    expect(() => assertMetaAdsLiveEnvironment({})).toThrow(MetaConfigurationError);
    expect(() => assertMetaAdsLiveEnvironment({
      META_ADS_MODE: "live",
      NODE_ENV: "production",
      CAMPAIGN_REPOSITORY_MODE: "supabase",
      META_OPERATION_LEDGER_MODE: "memory",
    })).toThrow(MetaConfigurationError);
    expect(() => assertMetaAdsLiveEnvironment({
      META_ADS_MODE: "live",
      NODE_ENV: "production",
      CAMPAIGN_REPOSITORY_MODE: "supabase",
      META_OPERATION_LEDGER_MODE: "supabase",
      META_DRAFT_OPERATOR_USER_IDS: operatorUserId,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      SIGNAL_HASH_SECRET: "signal-hash-secret-at-least-32-bytes-long",
      NEXT_PUBLIC_SITE_URL: "https://marketvalley.example",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key-test",
      TURNSTILE_SECRET_KEY: "turnstile-secret-key-test",
      META_PAGE_ID: binding.pageId,
      META_INSTAGRAM_ACTOR_ID: binding.instagramActorId,
      META_VERIFIED_PAGE_INSTAGRAM_BINDING: `${binding.pageId}:${binding.instagramActorId}`,
      META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT: verifiedPageInstagramBinding.verifiedAt,
    })).not.toThrow();
  });

  it("fails closed unless the verified user is in the internal Meta operator UUID allowlist", () => {
    const environment = {
      META_DRAFT_OPERATOR_USER_IDS:
        `${operatorUserId},22222222-2222-4222-8222-222222222222`,
    };
    expect(readMetaDraftOperatorUserIds(environment)).toEqual([
      operatorUserId,
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(isMetaDraftOperator(operatorUserId, environment)).toBe(true);
    expect(isMetaDraftOperator("33333333-3333-4333-8333-333333333333", environment)).toBe(false);
    expect(isMetaDraftOperator(operatorUserId, {})).toBe(false);
    expect(() => readMetaDraftOperatorUserIds({
      META_DRAFT_OPERATOR_USER_IDS: `${operatorUserId},${operatorUserId}`,
    })).toThrow(MetaConfigurationError);
  });

  it("requires an exact operator-attested Page–Instagram pair with a valid verification timestamp", () => {
    const environment = {
      META_PAGE_ID: binding.pageId,
      META_INSTAGRAM_ACTOR_ID: binding.instagramActorId,
      META_VERIFIED_PAGE_INSTAGRAM_BINDING: `${binding.pageId}:${binding.instagramActorId}`,
      META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT: verifiedPageInstagramBinding.verifiedAt,
    };

    expect(readMetaPageInstagramBindingAttestation(environment)).toEqual(
      verifiedPageInstagramBinding,
    );
    expect(() => readMetaPageInstagramBindingAttestation({
      ...environment,
      META_VERIFIED_PAGE_INSTAGRAM_BINDING: `${binding.pageId}:9999999999`,
    })).toThrow(MetaConfigurationError);
    expect(() => readMetaPageInstagramBindingAttestation({
      ...environment,
      META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT: "2026-02-31T12:00:00.000Z",
    })).toThrow(MetaConfigurationError);
    expect(() => new GraphMetaAdsProvider({
      binding,
      accessToken,
      appSecret,
      verifiedPageInstagramBinding: {
        ...verifiedPageInstagramBinding,
        instagramActorId: "9999999999",
      },
    })).toThrow(MetaConfigurationError);
  });

  it("keeps targeting fixed to KR/18–65 and bounds budget and the short schedule", () => {
    const policyEnvironment = {
      META_AD_ACCOUNT_ID: binding.adAccountId,
      META_PAGE_ID: binding.pageId,
      META_INSTAGRAM_ACTOR_ID: binding.instagramActorId,
      META_ALLOWED_DESTINATION_ORIGIN: binding.allowedDestinationOrigins[0],
      META_MAX_LIFETIME_BUDGET_MINOR: String(binding.maxLifetimeBudgetMinor),
      META_DRAFT_LIFETIME_BUDGET_MINOR: "10000",
      META_DRAFT_LEAD_MINUTES: "10",
      META_DRAFT_DURATION_HOURS: "24",
    };
    expect(readMetaPausedDraftServerPolicy(
      policyEnvironment,
      new Date("2026-08-25T12:00:00.000Z"),
    )).toEqual({
      targeting: { countries: ["KR"], ageMin: 18, ageMax: 65 },
      lifetimeBudgetMinor: 10_000,
      startsAt: "2026-08-25T12:10:00.000Z",
      endsAt: "2026-08-26T12:10:00.000Z",
    });
    expect(() => readMetaPausedDraftServerPolicy({
      ...policyEnvironment,
      META_DRAFT_LIFETIME_BUDGET_MINOR: "50001",
    }, new Date("2026-08-25T12:00:00.000Z"))).toThrow(MetaConfigurationError);
    expect(() => readMetaPausedDraftServerPolicy({
      ...policyEnvironment,
      META_DRAFT_DURATION_HOURS: "73",
    }, new Date("2026-08-25T12:00:00.000Z"))).toThrow(MetaConfigurationError);

    expect(readMetaPausedDraftServerPolicy(
      policyEnvironment,
      new Date("2026-09-25T12:00:01.000Z"),
    )).toMatchObject({
      startsAt: "2026-09-25T12:11:00.000Z",
      endsAt: "2026-09-26T12:11:00.000Z",
    });
  });

  it("marks every secret-bearing Meta module as server-only", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const paths = [
      "lib/meta/contracts.ts",
      "lib/meta/graphMetaAdsProvider.ts",
      "lib/meta/pausedCarouselDraftService.ts",
      "lib/meta/operationLedger.ts",
      "lib/meta/inMemoryMetaOperationLedger.ts",
      "lib/meta/dryRunMetaAdsProvider.ts",
      "lib/meta/metaConfig.ts",
      "lib/meta/supabaseMetaOperationLedger.ts",
    ];

    const sources = await Promise.all(paths.map((path) => readFile(`${root}${path}`, "utf8")));

    expect(sources.every((source) => source.startsWith('import "server-only";'))).toBe(true);
  });
});
