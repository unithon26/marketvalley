import "server-only";

import { createHash } from "node:crypto";

import {
  assertPausedStatus,
  type MetaAdPayload,
  type MetaAdsProvider,
  type MetaAdSetPayload,
  type MetaCampaignPayload,
  type MetaCarouselCreativePayload,
  type MetaConfiguredBinding,
  type MetaPngAsset,
  validateConfiguredBinding,
} from "@/lib/meta/contracts";

export type DryRunMetaCall =
  | { method: "verifyConfiguredAssets" }
  | { method: "uploadImage"; filename: string }
  | { method: "createCampaign"; payload: MetaCampaignPayload }
  | { method: "createAdSet"; payload: MetaAdSetPayload }
  | { method: "createCarouselCreative"; payload: MetaCarouselCreativePayload }
  | { method: "createAd"; payload: MetaAdPayload };

export type DryRunMetaStep = DryRunMetaCall["method"];

export class DryRunMetaAdsProvider implements MetaAdsProvider {
  readonly calls: DryRunMetaCall[] = [];
  private failAt: DryRunMetaStep | null;

  constructor(
    configuredBinding: MetaConfiguredBinding,
    options: { failAt?: DryRunMetaStep } = {},
  ) {
    validateConfiguredBinding(configuredBinding);
    this.failAt = options.failAt ?? null;
  }

  async verifyConfiguredAssets(): Promise<void> {
    this.record({ method: "verifyConfiguredAssets" });
  }

  async uploadImage(image: MetaPngAsset): Promise<string> {
    this.record({ method: "uploadImage", filename: image.filename });
    return `image_${this.digest(image.bytes)}`;
  }

  async createCampaign(payload: MetaCampaignPayload): Promise<string> {
    assertPausedStatus(payload.status);
    this.record({ method: "createCampaign", payload: structuredClone(payload) });
    return `campaign_${this.digest(payload.name)}`;
  }

  async createAdSet(payload: MetaAdSetPayload): Promise<string> {
    assertPausedStatus(payload.status);
    this.record({ method: "createAdSet", payload: structuredClone(payload) });
    return `adset_${this.digest(payload.name)}`;
  }

  async createCarouselCreative(payload: MetaCarouselCreativePayload): Promise<string> {
    this.record({ method: "createCarouselCreative", payload: structuredClone(payload) });
    return `creative_${this.digest(payload.name)}`;
  }

  async createAd(payload: MetaAdPayload): Promise<string> {
    assertPausedStatus(payload.status);
    this.record({ method: "createAd", payload: structuredClone(payload) });
    return `ad_${this.digest(payload.name)}`;
  }

  clearFailure(): void {
    this.failAt = null;
  }

  private record(call: DryRunMetaCall): void {
    this.calls.push(call);
    if (this.failAt === call.method) {
      throw new Error("dry-run injected Meta failure");
    }
  }

  private digest(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 24);
  }
}
