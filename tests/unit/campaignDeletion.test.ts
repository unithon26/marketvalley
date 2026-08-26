import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CampaignDeletionBlockedError } from "@/lib/contracts/repository";
import {
  assertMetaRunsPausedForDeletion,
  type CampaignDeletionMetaRun,
} from "@/lib/meta/campaignDeletion";

const pausedRun: CampaignDeletionMetaRun = {
  status: "PAUSED",
  meta_campaign_id: "12345",
  meta_ad_set_id: "23456",
  meta_ad_id: "34567",
};

describe("campaign deletion Meta guard", () => {
  it("DB와 Meta 세 객체가 모두 PAUSED일 때만 삭제를 허용한다", async () => {
    const getObjectStatus = vi.fn().mockResolvedValue({
      id: "12345",
      configuredStatus: "PAUSED",
      effectiveStatus: "PAUSED",
    });

    await expect(assertMetaRunsPausedForDeletion([pausedRun], { getObjectStatus }))
      .resolves.toBeUndefined();
    expect(getObjectStatus).toHaveBeenCalledTimes(3);
  });

  it("DB run이나 실제 Meta 객체가 ACTIVE이면 삭제를 차단한다", async () => {
    const getObjectStatus = vi.fn().mockResolvedValue({
      id: "12345",
      configuredStatus: "ACTIVE",
      effectiveStatus: "ACTIVE",
    });

    await expect(assertMetaRunsPausedForDeletion([
      { ...pausedRun, status: "ACTIVE" },
    ], { getObjectStatus })).rejects.toMatchObject({
      name: "CampaignDeletionBlockedError",
      reason: "live_ad",
    } satisfies Partial<CampaignDeletionBlockedError>);
    expect(getObjectStatus).not.toHaveBeenCalled();

    await expect(assertMetaRunsPausedForDeletion([pausedRun], { getObjectStatus }))
      .rejects.toMatchObject({
        name: "CampaignDeletionBlockedError",
        reason: "live_ad",
      } satisfies Partial<CampaignDeletionBlockedError>);

    getObjectStatus.mockResolvedValue({
      id: "12345",
      configuredStatus: "PAUSED",
      effectiveStatus: "ACTIVE",
    });
    await expect(assertMetaRunsPausedForDeletion([pausedRun], { getObjectStatus }))
      .rejects.toMatchObject({
        name: "CampaignDeletionBlockedError",
        reason: "live_ad",
      } satisfies Partial<CampaignDeletionBlockedError>);
  });

  it("Meta 상태 조회가 불확실하면 fail-closed한다", async () => {
    const getObjectStatus = vi.fn().mockRejectedValue(new Error("transport"));

    await expect(assertMetaRunsPausedForDeletion([pausedRun], { getObjectStatus }))
      .rejects.toMatchObject({
        name: "CampaignDeletionBlockedError",
        reason: "external_state_unknown",
      } satisfies Partial<CampaignDeletionBlockedError>);
  });
});
