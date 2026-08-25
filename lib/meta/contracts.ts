import "server-only";

import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export const META_GRAPH_API_VERSION = "v26.0" as const;
export const META_PAUSED_STATUS = "PAUSED" as const;
export const META_REQUIRED_IMAGE_COUNT = 5;
export const META_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const META_MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;
export const META_PNG_WIDTH = 1_080;
export const META_PNG_HEIGHT = 1_350;
export const META_MAX_PNG_CHUNKS = 256;

const objectIdPattern = /^\d{5,32}$/u;
const safeExternalIdPattern = /^[A-Za-z0-9_-]{5,256}$/u;
const safeSourceCampaignIdPattern = /^[A-Za-z0-9_-]{8,128}$/u;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
const expectedPngRowBytes = 1 + META_PNG_WIDTH * 4;
const expectedPngInflatedBytes = META_PNG_HEIGHT * expectedPngRowBytes;

export type MetaPausedStatus = typeof META_PAUSED_STATUS;

export type MetaConfiguredBinding = {
  adAccountId: string;
  pageId: string;
  instagramActorId: string;
  allowedDestinationOrigins: readonly string[];
  maxLifetimeBudgetMinor: number;
};

export type MetaPngAsset = {
  filename: string;
  contentType: "image/png";
  bytes: Uint8Array;
};

export type MetaCarouselCard = {
  headline: string;
  description: string;
};

export type MetaTargeting = {
  countries: readonly string[];
  ageMin: number;
  ageMax: number;
};

export type MetaPausedCarouselDraftInput = {
  sourceCampaignId: string;
  name: string;
  destinationUrl: string;
  message: string;
  headline: string;
  images: readonly MetaPngAsset[];
  cards: readonly MetaCarouselCard[];
  targeting: MetaTargeting;
  lifetimeBudgetMinor: number;
  startsAt: string;
  endsAt: string;
};

export type MetaCampaignPayload = {
  name: string;
  status: MetaPausedStatus;
  objective: "OUTCOME_TRAFFIC";
  buyingType: "AUCTION";
  specialAdCategories: readonly string[];
};

export type MetaAdSetPayload = {
  name: string;
  status: MetaPausedStatus;
  campaignId: string;
  billingEvent: "IMPRESSIONS";
  optimizationGoal: "LINK_CLICKS";
  bidStrategy: "LOWEST_COST_WITHOUT_CAP";
  lifetimeBudgetMinor: number;
  startsAt: string;
  endsAt: string;
  targeting: MetaTargeting;
};

export type MetaCarouselCreativePayload = {
  name: string;
  destinationUrl: string;
  message: string;
  headline: string;
  cards: readonly (MetaCarouselCard & { imageHash: string })[];
};

export type MetaAdPayload = {
  name: string;
  status: MetaPausedStatus;
  adSetId: string;
  creativeId: string;
};

export interface MetaAdsProvider {
  verifyConfiguredAssets(): Promise<void>;
  uploadImage(image: MetaPngAsset): Promise<string>;
  createCampaign(payload: MetaCampaignPayload): Promise<string>;
  createAdSet(payload: MetaAdSetPayload): Promise<string>;
  createCarouselCreative(payload: MetaCarouselCreativePayload): Promise<string>;
  createAd(payload: MetaAdPayload): Promise<string>;
}

export class MetaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaConfigurationError";
  }
}

export class MetaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaInputError";
  }
}

export class MetaUnsafeStatusError extends Error {
  constructor() {
    super("Meta 광고 초안은 PAUSED 상태로만 만들 수 있습니다.");
    this.name = "MetaUnsafeStatusError";
  }
}

export function assertPausedStatus(status: unknown): asserts status is MetaPausedStatus {
  if (status !== META_PAUSED_STATUS) throw new MetaUnsafeStatusError();
}

function assertMetaObjectId(label: string, value: string): void {
  if (!objectIdPattern.test(value)) {
    throw new MetaConfigurationError(`${label} 형식이 올바르지 않습니다.`);
  }
}

function normalizeAllowedOrigin(rawOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new MetaConfigurationError("Meta destination 허용 origin이 올바른 URL이 아닙니다.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new MetaConfigurationError("Meta destination 허용값은 HTTPS origin이어야 합니다.");
  }
  return parsed.origin;
}

export function validateConfiguredBinding(binding: MetaConfiguredBinding): MetaConfiguredBinding {
  assertMetaObjectId("Meta ad account ID", binding.adAccountId);
  assertMetaObjectId("Meta Page ID", binding.pageId);
  assertMetaObjectId("Meta Instagram actor ID", binding.instagramActorId);
  if (binding.allowedDestinationOrigins.length === 0) {
    throw new MetaConfigurationError("Meta destination 허용 origin이 필요합니다.");
  }
  const allowedDestinationOrigins = [...new Set(binding.allowedDestinationOrigins.map(normalizeAllowedOrigin))];
  if (!Number.isSafeInteger(binding.maxLifetimeBudgetMinor) || binding.maxLifetimeBudgetMinor < 100) {
    throw new MetaConfigurationError("Meta 최대 lifetime budget이 올바르지 않습니다.");
  }
  return { ...binding, allowedDestinationOrigins };
}

export function validateDestinationUrl(
  rawUrl: string,
  binding: MetaConfiguredBinding,
): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new MetaInputError("광고 destination URL이 올바르지 않습니다.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new MetaInputError("광고 destination은 자격증명과 fragment가 없는 HTTPS URL이어야 합니다.");
  }
  if (!binding.allowedDestinationOrigins.includes(parsed.origin)) {
    throw new MetaInputError("광고 destination이 서버에 연결된 사이트 origin과 일치하지 않습니다.");
  }
  return parsed.toString();
}

function pngLabel(index?: number): string {
  return index === undefined ? "Meta 이미지" : `Meta 이미지 ${index + 1}`;
}

function readPngUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1_00_00_00 +
    bytes[offset + 1] * 0x1_00_00 +
    bytes[offset + 2] * 0x1_00 +
    bytes[offset + 3]
  );
}

function readPngChunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function calculatePngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffff_ffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = pngCrcTable[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export function validateMetaPngAsset(image: MetaPngAsset, index?: number): void {
  const label = pngLabel(index);
  if (image.contentType !== "image/png") {
    throw new MetaInputError(`${label}은 PNG여야 합니다.`);
  }
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.png$/u.test(image.filename)) {
    throw new MetaInputError(`${label} 파일명이 올바르지 않습니다.`);
  }
  if (image.bytes.byteLength < 57 || image.bytes.byteLength > META_MAX_IMAGE_BYTES) {
    throw new MetaInputError(`${label} 크기가 허용 범위를 벗어났습니다.`);
  }
  for (const [signatureIndex, byte] of pngSignature.entries()) {
    if (image.bytes[signatureIndex] !== byte) {
      throw new MetaInputError(`${label}의 PNG signature가 올바르지 않습니다.`);
    }
  }

  let offset: number = pngSignature.length;
  let chunkCount = 0;
  let seenHeader = false;
  let seenImageData = false;
  let seenEnd = false;
  const imageDataChunks: Uint8Array[] = [];
  let imageDataBytes = 0;
  while (offset < image.bytes.byteLength) {
    chunkCount += 1;
    if (chunkCount > META_MAX_PNG_CHUNKS || offset + 12 > image.bytes.byteLength) {
      throw new MetaInputError(`${label}의 PNG chunk 구조가 올바르지 않습니다.`);
    }
    const chunkLength = readPngUint32(image.bytes, offset);
    const chunkType = readPngChunkType(image.bytes, offset + 4);
    const chunkEnd = offset + 12 + chunkLength;
    if (
      chunkLength > META_MAX_IMAGE_BYTES ||
      !/^[A-Za-z]{4}$/u.test(chunkType) ||
      !Number.isSafeInteger(chunkEnd) ||
      chunkEnd > image.bytes.byteLength
    ) {
      throw new MetaInputError(`${label}의 PNG chunk 범위가 올바르지 않습니다.`);
    }
    const storedCrc = readPngUint32(image.bytes, offset + 8 + chunkLength);
    const calculatedCrc = calculatePngCrc32(image.bytes, offset + 4, offset + 8 + chunkLength);
    if (storedCrc !== calculatedCrc) {
      throw new MetaInputError(`${label}의 PNG chunk CRC가 올바르지 않습니다.`);
    }

    if (!seenHeader) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        throw new MetaInputError(`${label}의 첫 PNG chunk는 13-byte IHDR여야 합니다.`);
      }
      const width = readPngUint32(image.bytes, offset + 8);
      const height = readPngUint32(image.bytes, offset + 12);
      if (width !== META_PNG_WIDTH || height !== META_PNG_HEIGHT) {
        throw new MetaInputError(`${label} 크기는 ${META_PNG_WIDTH}×${META_PNG_HEIGHT}px이어야 합니다.`);
      }
      if (
        image.bytes[offset + 16] !== 8 ||
        image.bytes[offset + 17] !== 6 ||
        image.bytes[offset + 18] !== 0 ||
        image.bytes[offset + 19] !== 0 ||
        image.bytes[offset + 20] !== 0
      ) {
        throw new MetaInputError(`${label}의 PNG IHDR는 8-bit RGBA non-interlaced 형식이어야 합니다.`);
      }
      seenHeader = true;
    } else if (chunkType === "IHDR") {
      throw new MetaInputError(`${label}에 IHDR chunk가 중복되었습니다.`);
    }

    if (chunkType === "IDAT") {
      if (chunkLength === 0 || seenEnd) {
        throw new MetaInputError(`${label}의 IDAT chunk가 올바르지 않습니다.`);
      }
      seenImageData = true;
      imageDataChunks.push(image.bytes.subarray(offset + 8, offset + 8 + chunkLength));
      imageDataBytes += chunkLength;
      if (imageDataBytes > META_MAX_IMAGE_BYTES) {
        throw new MetaInputError(`${label}의 PNG IDAT 크기가 허용 범위를 벗어났습니다.`);
      }
    }
    if (chunkType === "IEND") {
      if (chunkLength !== 0 || !seenImageData || chunkEnd !== image.bytes.byteLength) {
        throw new MetaInputError(`${label}의 IEND chunk가 올바르지 않습니다.`);
      }
      seenEnd = true;
    }
    offset = chunkEnd;
  }
  if (!seenHeader || !seenImageData || !seenEnd) {
    throw new MetaInputError(`${label}에 필수 PNG chunk가 없습니다.`);
  }

  const compressedImageData = Buffer.concat(
    imageDataChunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    imageDataBytes,
  );
  let inflatedImageData: Buffer;
  try {
    inflatedImageData = inflateSync(compressedImageData, {
      maxOutputLength: expectedPngInflatedBytes,
    });
  } catch {
    throw new MetaInputError(`${label}의 PNG IDAT zlib stream을 해제할 수 없습니다.`);
  }
  if (inflatedImageData.byteLength !== expectedPngInflatedBytes) {
    throw new MetaInputError(`${label}의 PNG scanline 길이가 올바르지 않습니다.`);
  }
  for (let row = 0; row < META_PNG_HEIGHT; row += 1) {
    if (inflatedImageData[row * expectedPngRowBytes] > 4) {
      throw new MetaInputError(`${label}의 PNG scanline filter가 올바르지 않습니다.`);
    }
  }
}

export function validateMetaPngAssets(images: readonly MetaPngAsset[]): void {
  if (images.length !== META_REQUIRED_IMAGE_COUNT) {
    throw new MetaInputError(`Meta 캐러셀에는 PNG가 정확히 ${META_REQUIRED_IMAGE_COUNT}개 필요합니다.`);
  }
  images.forEach(validateMetaPngAsset);
  if (new Set(images.map((image) => image.filename)).size !== META_REQUIRED_IMAGE_COUNT) {
    throw new MetaInputError("Meta 이미지 파일명은 서로 달라야 합니다.");
  }
  const totalImageBytes = images.reduce((total, image) => total + image.bytes.byteLength, 0);
  if (totalImageBytes > META_MAX_TOTAL_IMAGE_BYTES) {
    throw new MetaInputError("Meta 이미지 전체 크기가 허용 범위를 벗어났습니다.");
  }
}

function assertCopy(label: string, value: string, maxLength: number): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new MetaInputError(`${label} 길이가 올바르지 않습니다.`);
  }
}

function assertIsoTimestamp(label: string, value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) {
    throw new MetaInputError(`${label}이 올바른 ISO timestamp가 아닙니다.`);
  }
  return timestamp;
}

export function validatePausedCarouselDraftInput(
  input: MetaPausedCarouselDraftInput,
  configuredBinding: MetaConfiguredBinding,
): MetaPausedCarouselDraftInput {
  const binding = validateConfiguredBinding(configuredBinding);
  if (!safeSourceCampaignIdPattern.test(input.sourceCampaignId)) {
    throw new MetaInputError("원본 광고 ID 형식이 올바르지 않습니다.");
  }
  assertCopy("Meta 광고 이름", input.name, 120);
  assertCopy("Meta 기본 문구", input.message, 2_200);
  assertCopy("Meta headline", input.headline, 255);
  if (input.cards.length !== META_REQUIRED_IMAGE_COUNT) {
    throw new MetaInputError("Meta 캐러셀에는 카드 문구가 정확히 5개 필요합니다.");
  }
  validateMetaPngAssets(input.images);
  input.cards.forEach((card, index) => {
    assertCopy(`Meta 카드 ${index + 1} headline`, card.headline, 255);
    assertCopy(`Meta 카드 ${index + 1} description`, card.description, 255);
  });
  const countries = [...new Set(input.targeting.countries)];
  if (
    countries.length === 0 ||
    countries.length > 5 ||
    countries.some((country) => !/^[A-Z]{2}$/u.test(country))
  ) {
    throw new MetaInputError("Meta 타기팅 국가는 ISO 2자리 코드 1~5개여야 합니다.");
  }
  if (
    !Number.isInteger(input.targeting.ageMin) ||
    !Number.isInteger(input.targeting.ageMax) ||
    input.targeting.ageMin < 18 ||
    input.targeting.ageMax > 65 ||
    input.targeting.ageMin > input.targeting.ageMax
  ) {
    throw new MetaInputError("Meta 연령 타기팅 범위가 올바르지 않습니다.");
  }
  if (
    !Number.isSafeInteger(input.lifetimeBudgetMinor) ||
    input.lifetimeBudgetMinor < 100 ||
    input.lifetimeBudgetMinor > binding.maxLifetimeBudgetMinor
  ) {
    throw new MetaInputError("Meta lifetime budget이 서버 안전 한도를 벗어났습니다.");
  }
  const startsAt = assertIsoTimestamp("Meta 시작 시각", input.startsAt);
  const endsAt = assertIsoTimestamp("Meta 종료 시각", input.endsAt);
  if (endsAt <= startsAt || endsAt - startsAt > 7 * 24 * 60 * 60 * 1_000) {
    throw new MetaInputError("Meta 광고 기간은 0일 초과 7일 이하여야 합니다.");
  }

  return {
    ...input,
    destinationUrl: validateDestinationUrl(input.destinationUrl, binding),
    targeting: { ...input.targeting, countries },
  };
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function deriveMetaOperationDescriptor(
  input: MetaPausedCarouselDraftInput,
  binding: MetaConfiguredBinding,
): { operationKey: string; fingerprint: string } {
  const canonicalInput = {
    version: 1,
    binding: {
      adAccountId: binding.adAccountId,
      pageId: binding.pageId,
      instagramActorId: binding.instagramActorId,
    },
    input: {
      ...input,
      images: input.images.map((image) => ({
        filename: image.filename,
        contentType: image.contentType,
        byteLength: image.bytes.byteLength,
        sha256: hashBytes(image.bytes),
      })),
    },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(canonicalInput)).digest("hex");
  const stableKeyDigest = createHash("sha256").update(JSON.stringify({
    version: 1,
    adAccountId: binding.adAccountId,
    sourceCampaignId: input.sourceCampaignId,
  })).digest("hex");
  return { operationKey: `meta-paused-v1:${stableKeyDigest}`, fingerprint };
}

export function assertSafeExternalId(label: string, value: unknown): string {
  if (typeof value !== "string" || !safeExternalIdPattern.test(value)) {
    throw new Error(`${label} 응답 형식이 올바르지 않습니다.`);
  }
  return value;
}
