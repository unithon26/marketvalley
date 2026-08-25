import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  handleCreateMetaDraft,
  META_MAX_MULTIPART_BYTES,
  type MetaDraftRouteDependencies,
} from "@/app/api/meta/drafts/route";
import { AuthenticationRequiredError } from "@/lib/auth/authorization";
import type { CampaignRepository, PublishedCampaign } from "@/lib/contracts/repository";
import { demoCampaign } from "@/lib/demo/demo-campaign";
import {
  MetaOperationBusyError,
  MetaOperationNeedsReconciliationError,
  MetaOperationQuotaExceededError,
} from "@/lib/meta/operationLedger";

const ownerId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const campaign: PublishedCampaign = {
  id: campaignId,
  slug: "owner-campaign",
  spec: structuredClone(demoCampaign),
  publishedAt: "2026-08-25T00:00:00.000Z",
  nextAction: null,
};
const now = new Date("2026-08-25T12:00:00.000Z");

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

function chunk(type: string, data: Uint8Array | readonly number[]): number[] {
  const typeBytes = Array.from(type, (character) => character.charCodeAt(0));
  return [
    ...uint32(data.length),
    ...typeBytes,
    ...data,
    ...uint32(crc32([...typeBytes, ...data])),
  ];
}

let cachedPng: Uint8Array | null = null;
function validPng(): Uint8Array {
  if (cachedPng) return cachedPng;
  const raw = Buffer.alloc(1_350 * (1 + 1_080 * 4));
  cachedPng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...uint32(1_080), ...uint32(1_350), 8, 6, 0, 0, 0]),
    ...chunk("IDAT", deflateSync(raw)),
    ...chunk("IEND", []),
  ]);
  return cachedPng;
}

function form(): FormData {
  const value = new FormData();
  value.set("campaignId", campaignId);
  for (let index = 0; index < 5; index += 1) {
    value.set(
      `image${index}`,
      new File([validPng().slice().buffer as ArrayBuffer], `client-controlled-${index}.png`, { type: "image/png" }),
    );
  }
  return value;
}

function request(body: FormData, options: {
  origin?: string;
  contentLength?: string;
  contentType?: string;
} = {}): Request {
  const headers = new Headers({
    Origin: options.origin ?? "https://marketvalley.example",
    "Content-Length": options.contentLength ?? "100000",
  });
  if (options.contentType) headers.set("Content-Type", options.contentType);
  return new Request("https://marketvalley.example/api/meta/drafts", {
    method: "POST",
    headers,
    body,
  });
}

function repository(value: PublishedCampaign | null = campaign): CampaignRepository {
  return {
    getById: vi.fn(async () => value),
  } as unknown as CampaignRepository;
}

function environment(): Record<string, string> {
  return {
    META_ADS_MODE: "live",
    NODE_ENV: "production",
    CAMPAIGN_REPOSITORY_MODE: "supabase",
    META_OPERATION_LEDGER_MODE: "supabase",
    META_DRAFT_OPERATOR_USER_IDS: ownerId,
    NEXT_PUBLIC_SITE_URL: "https://marketvalley.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    SIGNAL_HASH_SECRET: "signal-hash-secret-at-least-32-bytes-long",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key-test",
    TURNSTILE_SECRET_KEY: "turnstile-secret-key-test",
    META_AD_ACCOUNT_ID: "1234567890",
    META_PAGE_ID: "2345678901",
    META_INSTAGRAM_ACTOR_ID: "3456789012",
    META_VERIFIED_PAGE_INSTAGRAM_BINDING: "2345678901:3456789012",
    META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT: "2026-08-25T10:00:00.000Z",
    META_ALLOWED_DESTINATION_ORIGIN: "https://marketvalley.example",
    META_MAX_LIFETIME_BUDGET_MINOR: "50000",
    META_DRAFT_LIFETIME_BUDGET_MINOR: "10000",
    META_DRAFT_STARTS_AT: "2026-08-26T00:00:00.000Z",
    META_DRAFT_ENDS_AT: "2026-08-27T00:00:00.000Z",
  };
}

function dependencies(options: {
  environment?: Record<string, string>;
  ownerCampaign?: PublishedCampaign | null;
  create?: ReturnType<typeof vi.fn>;
  requireIdentity?: MetaDraftRouteDependencies["requireIdentity"];
  parseFormData?: MetaDraftRouteDependencies["parseFormData"];
} = {}): MetaDraftRouteDependencies & { create: ReturnType<typeof vi.fn> } {
  const create = options.create ?? vi.fn(async () => ({
    operationKey: `meta-paused-v1:${"a".repeat(64)}`,
    imageHashes: ["image_0", "image_1", "image_2", "image_3", "image_4"],
    campaignId: "campaign_12345",
    adSetId: "adset_12345",
    creativeId: "creative_12345",
    adId: "ad_12345",
    status: "PAUSED" as const,
  }));
  return {
    environment: options.environment ?? environment(),
    requireIdentity: options.requireIdentity ?? vi.fn(async () => ({ userId: ownerId })),
    getOwnerRepository: vi.fn(async () => repository(options.ownerCampaign)),
    createDraftCreator: vi.fn(() => ({
      create: create as unknown as ReturnType<MetaDraftRouteDependencies["createDraftCreator"]>["create"],
    })),
    parseFormData: options.parseFormData ?? ((incoming) => incoming.formData()),
    now: () => now,
    create,
  };
}

describe("Meta PAUSED draft route", () => {
  it("accepts only owner campaignId+five PNGs and derives every advertising field server-side", async () => {
    const deps = dependencies();
    const response = await handleCreateMetaDraft(request(form()), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "completed", status: "PAUSED" });
    expect(deps.requireIdentity).toHaveBeenCalledTimes(1);
    expect(deps.getOwnerRepository).toHaveBeenCalledTimes(1);
    expect(deps.create).toHaveBeenCalledTimes(1);
    const input = deps.create.mock.calls[0][0];
    expect(input).toMatchObject({
      sourceCampaignId: campaignId,
      name: `${campaign.spec.project.name} 시장검증`,
      message: campaign.spec.messaging.caption,
      headline: campaign.spec.messaging.hooks[0],
      destinationUrl: `https://marketvalley.example/p/owner-campaign?utm_source=meta&utm_medium=paid_social&utm_campaign=${campaignId}`,
      targeting: { countries: ["KR"], ageMin: 18, ageMax: 65 },
      lifetimeBudgetMinor: 10_000,
      startsAt: "2026-08-26T00:00:00.000Z",
      endsAt: "2026-08-27T00:00:00.000Z",
    });
    expect(input.images.map((image: { filename: string }) => image.filename)).toEqual([
      "01-hook.png", "02-problem.png", "03-insight.png", "04-solution.png", "05-cta.png",
    ]);
    expect(input.cards).toEqual([
      { headline: campaign.spec.messaging.hooks[0], description: campaign.spec.carousel.hookBody },
      { headline: campaign.spec.carousel.problem.headline, description: campaign.spec.carousel.problem.body },
      { headline: campaign.spec.carousel.insight.headline, description: campaign.spec.carousel.insight.body },
      { headline: campaign.spec.messaging.valueProposition, description: campaign.spec.carousel.solutionBody },
      { headline: campaign.spec.validation.signal.ctaLabel, description: campaign.spec.carousel.ctaBody },
    ]);
    expect(input).not.toHaveProperty("adAccountId");
    expect(input).not.toHaveProperty("pageId");
    expect(input).not.toHaveProperty("instagramActorId");
    expect(input).not.toHaveProperty("status");
  });

  it("rejects disabled, cross-origin, and untrusted length requests before parsing multipart", async () => {
    const missingOperatorAllowlist = environment();
    delete missingOperatorAllowlist.META_DRAFT_OPERATOR_USER_IDS;
    for (const [incoming, env, expectedStatus, expectedCode] of [
      [request(form()), { ...environment(), META_ADS_MODE: "disabled" }, 503, "meta_disabled"],
      [request(form()), missingOperatorAllowlist, 503, "meta_draft_unavailable"],
      [request(form(), { origin: "https://attacker.example" }), environment(), 403, "invalid_origin"],
      [request(form(), { contentLength: "0" }), environment(), 411, "content_length_required"],
      [request(form(), { contentLength: String(META_MAX_MULTIPART_BYTES + 1) }), environment(), 413, "payload_too_large"],
    ] as const) {
      const parseFormData = vi.fn(async (value: Request) => value.formData());
      const deps = dependencies({ environment: env, parseFormData });
      const response = await handleCreateMetaDraft(incoming, deps);
      expect(response.status).toBe(expectedStatus);
      expect((await response.json()).error.code).toBe(expectedCode);
      expect(parseFormData).not.toHaveBeenCalled();
      expect(deps.create).not.toHaveBeenCalled();
    }
  });

  it("rejects missing, duplicate, non-PNG, and client-controlled advertising fields", async () => {
    const malformed = [
      (() => { const value = form(); value.delete("image4"); return value; })(),
      (() => { const value = form(); value.append("campaignId", campaignId); return value; })(),
      (() => { const value = form(); value.set("image2", new File([validPng().slice().buffer as ArrayBuffer], "x.txt", { type: "text/plain" })); return value; })(),
      (() => { const value = form(); value.set("status", "PAUSED"); return value; })(),
      (() => { const value = form(); value.set("destinationUrl", "https://attacker.example"); return value; })(),
    ];

    for (const value of malformed) {
      const deps = dependencies();
      const response = await handleCreateMetaDraft(request(value), deps);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(deps.create).not.toHaveBeenCalled();
    }
  });

  it("requires verified identity and an owner-scoped campaign before creating a draft", async () => {
    const unauthenticated = dependencies({
      requireIdentity: vi.fn(async () => { throw new AuthenticationRequiredError(); }),
    });
    const unauthenticatedResponse = await handleCreateMetaDraft(request(form()), unauthenticated);
    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticated.create).not.toHaveBeenCalled();

    const notOwner = dependencies({ ownerCampaign: null });
    const notOwnerResponse = await handleCreateMetaDraft(request(form()), notOwner);
    expect(notOwnerResponse.status).toBe(404);
    expect((await notOwnerResponse.json()).error.code).toBe("campaign_not_found");
    expect(notOwner.create).not.toHaveBeenCalled();
  });

  it("rejects a verified campaign owner who is not an internal Meta operator before parsing PNGs", async () => {
    const parseFormData = vi.fn(async (incoming: Request) => incoming.formData());
    const deps = dependencies({
      requireIdentity: vi.fn(async () => ({
        userId: "44444444-4444-4444-8444-444444444444",
      })),
      parseFormData,
    });

    const response = await handleCreateMetaDraft(request(form()), deps);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("meta_operator_required");
    expect(parseFormData).not.toHaveBeenCalled();
    expect(deps.getOwnerRepository).not.toHaveBeenCalled();
    expect(deps.create).not.toHaveBeenCalled();
  });

  it.each([
    [new MetaOperationBusyError(), 409, "meta_operation_busy"],
    [new MetaOperationQuotaExceededError(), 429, "meta_quota_exceeded"],
  ])("maps %s without automatically retrying", async (error, status, code) => {
    const create = vi.fn().mockRejectedValue(error);
    const deps = dependencies({ create });
    const response = await handleCreateMetaDraft(request(form()), deps);

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns explicit reconciliation state and never retries an uncertain external write", async () => {
    const create = vi.fn().mockRejectedValue(new MetaOperationNeedsReconciliationError(
      `meta-paused-v1:${"a".repeat(64)}`,
      "creative",
    ));
    const deps = dependencies({ create });
    const response = await handleCreateMetaDraft(request(form()), deps);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      state: "reconciliation_required",
      step: "creative",
      error: { code: "meta_reconciliation_required" },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
