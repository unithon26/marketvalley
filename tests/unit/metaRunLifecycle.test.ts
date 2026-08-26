import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMetaAdRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/meta/metaAdRun", () => ({
  storeMetaInsightSnapshot: vi.fn(),
  updateMetaAdRun: mocks.updateMetaAdRun,
}));

import type { MetaAdRun } from "@/lib/meta/metaAdRun";
import { activateMetaRun } from "@/lib/meta/metaRunLifecycle";

const run: MetaAdRun = {
  id: "11111111-1111-4111-8111-111111111111",
  operationKey: "operation-key",
  ownerId: "22222222-2222-4222-8222-222222222222",
  campaignId: "33333333-3333-4333-8333-333333333333",
  adAccountId: "12345",
  metaCampaignId: "45678",
  metaAdSetId: "56789",
  metaCreativeId: "67890",
  metaAdId: "78901",
  lifetimeBudgetMinor: 5000,
  startsAt: "2026-08-26T03:00:00.000Z",
  endsAt: "2026-08-27T03:00:00.000Z",
  status: "PAUSED",
  approvedAt: null,
  pausedAt: null,
  lastError: null,
};

describe("Meta run activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMetaAdRun.mockResolvedValue({ ...run, status: "ACTIVATING" });
  });

  it("waits for the lifecycle poll instead of failing on a stale immediate status read", async () => {
    const getObjectStatus = vi.fn(async (objectId: string) => ({
      id: objectId,
      configuredStatus: "PAUSED",
      effectiveStatus: "PAUSED",
    }));
    const setObjectStatus = vi.fn(async (
      objectId: string,
      status: "ACTIVE" | "PAUSED",
    ) => {
      void objectId;
      void status;
    });
    const provider = {
      getAccountReadiness: vi.fn(async () => ({
        adAccountId: "12345",
        accountStatus: 1,
        disableReason: 0,
        currency: "KRW",
        amountSpentMinor: 0,
        balanceMinor: 0,
        hasFundingSource: true,
      })),
      getObjectStatus,
      getInsights: vi.fn(async () => ({
        impressions: 0,
        reach: 0,
        clicks: 0,
        linkClicks: 0,
        spendMinor: 0,
        currency: "KRW",
        dateStart: "2026-08-26",
        dateStop: "2026-08-26",
      })),
      setObjectStatus,
    };

    await expect(activateMetaRun({
      client: {} as never,
      provider,
      run,
      approvedBy: run.ownerId,
    })).resolves.toMatchObject({ status: "ACTIVATING" });

    expect(setObjectStatus.mock.calls.map((call) => call[0])).toEqual([
      run.metaAdId,
      run.metaAdSetId,
      run.metaCampaignId,
    ]);
    expect(getObjectStatus).not.toHaveBeenCalled();
    expect(mocks.updateMetaAdRun).toHaveBeenCalledTimes(1);
  });
});
