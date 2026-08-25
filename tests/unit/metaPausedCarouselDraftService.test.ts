import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertSafeExternalId,
  deriveMetaOperationDescriptor,
  type MetaConfiguredBinding,
  type MetaPausedCarouselDraftInput,
  MetaInputError,
} from "@/lib/meta/contracts";
import { DryRunMetaAdsProvider } from "@/lib/meta/dryRunMetaAdsProvider";
import { InMemoryMetaOperationLedger } from "@/lib/meta/inMemoryMetaOperationLedger";
import {
  MetaOperationConflictError,
  MetaOperationNeedsReconciliationError,
  MetaReconciliationResolutionError,
} from "@/lib/meta/operationLedger";
import { PausedCarouselDraftService } from "@/lib/meta/pausedCarouselDraftService";

const binding: MetaConfiguredBinding = {
  adAccountId: "1234567890",
  pageId: "2345678901",
  instagramActorId: "3456789012",
  allowedDestinationOrigins: ["https://marketvalley.example"],
  maxLifetimeBudgetMinor: 50_000,
};

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

const pngCache = new Map<string, Uint8Array>();

function png(index: number, width = 1_080, height = 1_350): Uint8Array {
  const cacheKey = `${index}:${width}:${height}`;
  const cached = pngCache.get(cacheKey);
  if (cached) return cached;
  const rawScanlines = Buffer.alloc(1_350 * (1 + 1_080 * 4));
  rawScanlines[1] = index;
  const compressed = deflateSync(rawScanlines);
  const encoded = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [...uint32(width), ...uint32(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", compressed),
    ...pngChunk("IEND", []),
  ]);
  pngCache.set(cacheKey, encoded);
  return encoded;
}

function input(): MetaPausedCarouselDraftInput {
  return {
    sourceCampaignId: "campaign-source-001",
    name: "시장검증 광고",
    destinationUrl: "https://marketvalley.example/p/launch?utm_source=meta",
    message: "사전예약으로 첫 반응을 확인해 보세요.",
    headline: "첫 반응 확인하기",
    images: Array.from({ length: 5 }, (_, index) => ({
      filename: `0${index + 1}-card.png`,
      contentType: "image/png" as const,
      bytes: png(index),
    })),
    cards: Array.from({ length: 5 }, (_, index) => ({
      headline: `${index + 1}장 제목`,
      description: `${index + 1}장 설명`,
    })),
    targeting: { countries: ["KR"], ageMin: 20, ageMax: 45 },
    lifetimeBudgetMinor: 10_000,
    startsAt: "2026-08-26T01:00:00.000Z",
    endsAt: "2026-08-28T01:00:00.000Z",
  };
}

describe("PausedCarouselDraftService", () => {
  it("uploads exactly five PNGs before creating a PAUSED campaign, ad set, creative, and ad", async () => {
    const provider = new DryRunMetaAdsProvider(binding);
    const service = new PausedCarouselDraftService(
      provider,
      new InMemoryMetaOperationLedger(),
      binding,
    );

    const result = await service.create(input());

    expect(provider.calls.map((call) => call.method)).toEqual([
      "verifyConfiguredAssets",
      "uploadImage",
      "uploadImage",
      "uploadImage",
      "uploadImage",
      "uploadImage",
      "createCampaign",
      "createAdSet",
      "createCarouselCreative",
      "createAd",
    ]);
    expect(result.status).toBe("PAUSED");
    expect(result.imageHashes).toHaveLength(5);
    const campaignCall = provider.calls.find((call) => call.method === "createCampaign");
    const adSetCall = provider.calls.find((call) => call.method === "createAdSet");
    const creativeCall = provider.calls.find((call) => call.method === "createCarouselCreative");
    const adCall = provider.calls.find((call) => call.method === "createAd");
    expect(campaignCall).toMatchObject({ payload: { status: "PAUSED", objective: "OUTCOME_TRAFFIC" } });
    expect(adSetCall).toMatchObject({ payload: { status: "PAUSED", lifetimeBudgetMinor: 10_000 } });
    expect(creativeCall).toMatchObject({
      payload: {
        destinationUrl: input().destinationUrl,
        cards: result.imageHashes.map((imageHash, index) => ({
          imageHash,
          headline: `${index + 1}장 제목`,
          description: `${index + 1}장 설명`,
        })),
      },
    });
    expect(adCall).toMatchObject({ payload: { status: "PAUSED" } });
  });

  it("returns a completed operation for serial and concurrent duplicates without creating more objects", async () => {
    const provider = new DryRunMetaAdsProvider(binding);
    const ledger = new InMemoryMetaOperationLedger();
    const service = new PausedCarouselDraftService(provider, ledger, binding);

    const [first, concurrentDuplicate] = await Promise.all([
      service.create(input()),
      service.create(input()),
    ]);
    const callsAfterConcurrentRequests = provider.calls.length;
    const laterDuplicate = await service.create(input());

    expect(concurrentDuplicate).toEqual(first);
    expect(laterDuplicate).toEqual(first);
    expect(callsAfterConcurrentRequests).toBe(10);
    expect(provider.calls).toHaveLength(10);
  });

  it("resumes from explicitly recorded process-local checkpoints", async () => {
    const draft = input();
    const descriptor = deriveMetaOperationDescriptor(draft, binding);
    const ledger = new InMemoryMetaOperationLedger();
    ledger.seedForTest({
      ...descriptor,
      status: "OPEN",
      checkpoints: {
        "image:0": "saved_image_0",
        "image:1": "saved_image_1",
        "image:2": "saved_image_2",
        "image:3": "saved_image_3",
        "image:4": "saved_image_4",
        campaign: "saved_campaign",
      },
    });
    const provider = new DryRunMetaAdsProvider(binding);

    const result = await new PausedCarouselDraftService(provider, ledger, binding).create(draft);

    expect(provider.calls.map((call) => call.method)).toEqual([
      "verifyConfiguredAssets",
      "createAdSet",
      "createCarouselCreative",
      "createAd",
    ]);
    expect(result.campaignId).toBe("saved_campaign");
    expect(result.imageHashes).toEqual(Array.from({ length: 5 }, (_, index) => `saved_image_${index}`));
  });

  it("marks an uncertain write for reconciliation and never retries it blindly", async () => {
    const provider = new DryRunMetaAdsProvider(binding, { failAt: "createAdSet" });
    const ledger = new InMemoryMetaOperationLedger();
    const service = new PausedCarouselDraftService(provider, ledger, binding);
    const descriptor = deriveMetaOperationDescriptor(input(), binding);

    await expect(service.create(input())).rejects.toMatchObject({
      name: "MetaOperationNeedsReconciliationError",
      step: "ad-set",
    });
    expect(ledger.readForTest(descriptor.operationKey)).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      reconciliationStep: "ad-set",
      checkpoints: { campaign: expect.any(String) },
    });
    const callsAfterFailure = provider.calls.length;
    provider.clearFailure();

    await expect(service.create(input())).rejects.toBeInstanceOf(
      MetaOperationNeedsReconciliationError,
    );
    expect(provider.calls).toHaveLength(callsAfterFailure);
    await expect(ledger.resolveReconciliation(descriptor, {
      step: "creative",
      outcome: "VERIFIED_NOT_CREATED",
      resolvedBy: "operator_12345",
      note: "다른 단계를 확인한 잘못된 reconciliation 시도입니다.",
    })).rejects.toBeInstanceOf(MetaReconciliationResolutionError);
    await expect(service.create(input())).rejects.toBeInstanceOf(
      MetaOperationNeedsReconciliationError,
    );
    expect(provider.calls).toHaveLength(callsAfterFailure);

    await ledger.resolveReconciliation(descriptor, {
      step: "ad-set",
      outcome: "VERIFIED_NOT_CREATED",
      resolvedBy: "operator_12345",
      note: "Ads Manager에서 해당 이름과 생성 시각을 대조했으나 객체가 없음을 확인했습니다.",
    });
    provider.clearFailure();
    const result = await service.create(input());

    expect(result.status).toBe("PAUSED");
    expect(provider.calls.slice(callsAfterFailure).map((call) => call.method)).toEqual([
      "verifyConfiguredAssets",
      "createAdSet",
      "createCarouselCreative",
      "createAd",
    ]);
    expect(ledger.readForTest(descriptor.operationKey)).toMatchObject({
      status: "COMPLETED",
      reconciliationHistory: [{
        step: "ad-set",
        outcome: "VERIFIED_NOT_CREATED",
        resolvedBy: "operator_12345",
      }],
    });
  });

  it("records an operator-verified external ID and resumes after that exact step", async () => {
    const provider = new DryRunMetaAdsProvider(binding, { failAt: "createCarouselCreative" });
    const ledger = new InMemoryMetaOperationLedger();
    const service = new PausedCarouselDraftService(provider, ledger, binding);
    const descriptor = deriveMetaOperationDescriptor(input(), binding);

    await expect(service.create(input())).rejects.toMatchObject({ step: "creative" });
    const callsAfterFailure = provider.calls.length;
    await ledger.resolveReconciliation(descriptor, {
      step: "creative",
      outcome: "VERIFIED_CREATED",
      externalId: "verified_creative_12345",
      resolvedBy: "operator_12345",
      note: "Ads Manager에서 operation suffix와 생성 시각이 일치하는 creative ID를 확인했습니다.",
    });
    provider.clearFailure();

    const result = await service.create(input());

    expect(result.creativeId).toBe("verified_creative_12345");
    expect(provider.calls.slice(callsAfterFailure).map((call) => call.method)).toEqual([
      "verifyConfiguredAssets",
      "createAd",
    ]);
  });

  it("keeps one semantic operation key and rejects changed input with a new fingerprint", async () => {
    const original = input();
    const changed = { ...input(), message: "서로 다른 광고 문구입니다." };
    const originalDescriptor = deriveMetaOperationDescriptor(original, binding);
    const changedDescriptor = deriveMetaOperationDescriptor(changed, binding);
    const provider = new DryRunMetaAdsProvider(binding);
    const service = new PausedCarouselDraftService(
      provider,
      new InMemoryMetaOperationLedger(),
      binding,
    );

    expect(changedDescriptor.operationKey).toBe(originalDescriptor.operationKey);
    expect(changedDescriptor.fingerprint).not.toBe(originalDescriptor.fingerprint);
    expect(deriveMetaOperationDescriptor(original, {
      ...binding,
      adAccountId: "9999999999",
    }).operationKey).not.toBe(originalDescriptor.operationKey);
    await service.create(original);
    const callsAfterOriginal = provider.calls.length;

    await expect(service.create(changed)).rejects.toBeInstanceOf(MetaOperationConflictError);
    expect(provider.calls).toHaveLength(callsAfterOriginal);
  });

  it("keeps the same fingerprint when only the server-relative schedule moves", () => {
    const original = input();
    const laterWindow = {
      ...input(),
      startsAt: "2026-08-27T01:00:00.000Z",
      endsAt: "2026-08-29T01:00:00.000Z",
    };

    expect(deriveMetaOperationDescriptor(laterWindow, binding)).toEqual(
      deriveMetaOperationDescriptor(original, binding),
    );
  });

  it("turns a crash-window attempt marker into reconciliation instead of repeating the write", async () => {
    const draft = input();
    const descriptor = deriveMetaOperationDescriptor(draft, binding);
    const ledger = new InMemoryMetaOperationLedger();
    ledger.seedForTest({
      ...descriptor,
      status: "OPEN",
      attemptingStep: "campaign",
      checkpoints: {
        "image:0": "saved_image_0",
        "image:1": "saved_image_1",
        "image:2": "saved_image_2",
        "image:3": "saved_image_3",
        "image:4": "saved_image_4",
      },
    });
    const provider = new DryRunMetaAdsProvider(binding);

    await expect(new PausedCarouselDraftService(provider, ledger, binding).create(draft))
      .rejects.toMatchObject({ step: "campaign" });

    expect(provider.calls).toEqual([]);
    expect(ledger.readForTest(descriptor.operationKey)).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      reconciliationStep: "campaign",
    });
  });

  it("rejects malformed operator resolutions without changing reconciliation state", async () => {
    const descriptor = deriveMetaOperationDescriptor(input(), binding);
    const ledger = new InMemoryMetaOperationLedger();
    ledger.seedForTest({
      ...descriptor,
      status: "RECONCILIATION_REQUIRED",
      reconciliationStep: "campaign",
      checkpoints: {},
    });
    const malformedResolutions: unknown[] = [
      undefined,
      false,
      {
        step: "campaign",
        outcome: "VERIFIED_CREATED",
        resolvedBy: "operator_12345",
        note: "외부 객체를 확인했지만 ID가 누락됐습니다.",
      },
      {
        step: "campaign",
        outcome: "VERIFIED_NOT_CREATED",
        note: "미생성을 확인했지만 운영자가 누락됐습니다.",
      },
      {
        step: "campaign",
        outcome: "VERIFIED_NOT_CREATED",
        resolvedBy: false,
        note: "운영자 ID 타입이 올바르지 않습니다.",
      },
      {
        step: "campaign",
        outcome: false,
        resolvedBy: "operator_12345",
        note: "확인 결과 타입이 올바르지 않습니다.",
      },
      {
        step: "campaign",
        outcome: "VERIFIED_CREATED",
        externalId: false,
        resolvedBy: "operator_12345",
        note: "외부 ID 타입이 올바르지 않습니다.",
      },
      {
        step: "campaign",
        outcome: "VERIFIED_CREATED",
        externalId: "campaign_12345",
        resolvedBy: "operator_12345",
        note: false,
      },
    ];

    expect(() => assertSafeExternalId("Meta ID", undefined)).toThrow();
    expect(() => assertSafeExternalId("Meta ID", false)).toThrow();
    for (const resolution of malformedResolutions) {
      await expect(ledger.resolveReconciliation(descriptor, resolution))
        .rejects.toBeInstanceOf(MetaReconciliationResolutionError);
      expect(ledger.readForTest(descriptor.operationKey)).toMatchObject({
        status: "RECONCILIATION_REQUIRED",
        reconciliationStep: "campaign",
        checkpoints: {},
      });
    }
  });

  it("rejects unbound destinations and invalid PNGs before provider calls", async () => {
    const provider = new DryRunMetaAdsProvider(binding);
    const service = new PausedCarouselDraftService(
      provider,
      new InMemoryMetaOperationLedger(),
      binding,
    );
    const unbound = { ...input(), destinationUrl: "https://attacker.example/p/launch" };
    const badPng = input();
    badPng.images = badPng.images.map((image, index) =>
      index === 2 ? { ...image, bytes: Uint8Array.of(1, 2, 3) } : image);

    await expect(service.create(unbound)).rejects.toBeInstanceOf(MetaInputError);
    await expect(service.create(badPng)).rejects.toBeInstanceOf(MetaInputError);
    expect(provider.calls).toEqual([]);
  });
});
