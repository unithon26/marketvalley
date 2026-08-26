import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMetaDraft: vi.fn(),
  getLatestMetaAdRun: vi.fn(),
  readMetaPolicy: vi.fn(),
  registerMetaAdRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/meta/campaignDraftInput", () => ({
  deriveMetaPausedDraftInput: vi.fn(() => ({})),
}));
vi.mock("@/lib/meta/metaAdRun", () => ({
  getLatestMetaAdRun: mocks.getLatestMetaAdRun,
  registerMetaAdRun: mocks.registerMetaAdRun,
}));
vi.mock("@/lib/meta/metaConfig", () => ({
  assertMetaAutomaticActivationAuthorized: vi.fn(),
  createGraphMetaAdsProviderFromEnvironment: vi.fn(() => ({})),
  isMetaAutomaticActivationConfigured: vi.fn(() => true),
  isMetaDraftOperator: vi.fn(() => true),
  readMetaConfiguredBinding: vi.fn(() => ({
    adAccountId: "act_12345",
    allowedDestinationOrigins: ["https://example.com"],
  })),
  readMetaPausedDraftServerPolicy: mocks.readMetaPolicy,
}));
vi.mock("@/lib/meta/pausedCarouselDraftService", () => ({
  PausedCarouselDraftService: class {
    create(...args: unknown[]) {
      return mocks.createMetaDraft(...args);
    }
  },
}));
vi.mock("@/lib/rendering/carouselImage", () => ({
  renderCampaignCarouselPngAssets: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase/serviceClient", () => ({
  createSupabaseServiceClient: vi.fn(() => ({})),
}));

import {
  processClaimedCampaign,
} from "@/lib/lifecycle/campaignLifecycleProcessor";
import type {
  CampaignLifecycleStore,
  ClaimedCampaign,
} from "@/lib/lifecycle/campaignLifecycleStore";

function claimedCampaign(overrides: Partial<ClaimedCampaign> = {}): ClaimedCampaign {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "22222222-2222-4222-8222-222222222222",
    draftId: "33333333-3333-4333-8333-333333333333",
    status: "PREPARING",
    retryFromStatus: null,
    stageAttempts: 2,
    generationAttempts: 1,
    input: null,
    spec: {} as NonNullable<ClaimedCampaign["spec"]>,
    slug: "quota-retry-test",
    publishedAt: "2026-08-26T02:30:00.000Z",
    processingToken: "44444444-4444-4444-8444-444444444444",
    preparationCompletedAt: null,
    collectionStartedAt: "2026-08-26T03:00:00.000Z",
    collectionEndsAt: "2026-08-27T03:00:00.000Z",
    completedAt: null,
    lastErrorCode: null,
    createdAt: "2026-08-26T02:30:00.000Z",
    updatedAt: "2026-08-26T02:30:00.000Z",
    ...overrides,
  };
}

function mockStore(renewed: ClaimedCampaign) {
  const renew = vi.fn(async () => renewed);
  const transition = vi.fn(async () => undefined);
  return {
    renew,
    transition,
    value: { renew, transition } as unknown as CampaignLifecycleStore,
  };
}

describe("campaign lifecycle Meta operation preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLatestMetaAdRun.mockResolvedValue(null);
    mocks.readMetaPolicy.mockReturnValue({
      startsAt: "2026-08-26T03:00:00.000Z",
      endsAt: "2026-08-27T03:00:00.000Z",
    });
  });

  it("refreshes an elapsed collection window before preparing a draft", async () => {
    const retryNow = new Date("2026-08-27T00:01:00.000Z");
    const initial = claimedCampaign({
      status: "RETRY_WAIT",
      retryFromStatus: "PREPARING",
      stageAttempts: 3,
      lastErrorCode: "meta_operation_ledger_unavailable_error",
      collectionStartedAt: "2026-08-26T02:40:00.000Z",
      collectionEndsAt: "2026-08-26T23:40:00.000Z",
    });
    const renewed = claimedCampaign({
      status: "PREPARING",
      stageAttempts: 4,
      collectionStartedAt: initial.collectionStartedAt,
      collectionEndsAt: initial.collectionEndsAt,
      lastErrorCode: initial.lastErrorCode,
    });
    const store = mockStore(renewed);
    mocks.readMetaPolicy.mockReturnValue({
      startsAt: "2026-08-27T00:11:00.000Z",
      endsAt: "2026-08-28T00:11:00.000Z",
    });

    await expect(processClaimedCampaign({
      initialCampaign: initial,
      store: store.value,
      environment: {},
      now: () => retryNow,
    })).resolves.toBe("PREPARING");

    expect(store.transition).toHaveBeenCalledWith(renewed, {
      status: "PREPARING",
      collectionStartedAt: "2026-08-27T00:11:00.000Z",
      collectionEndsAt: "2026-08-28T00:11:00.000Z",
      nextAttemptAt: retryNow.toISOString(),
      clearError: true,
    });
    expect(mocks.createMetaDraft).not.toHaveBeenCalled();
  });

  it("preserves the external operation schedule during non-quota crash recovery", async () => {
    const retryNow = new Date("2026-08-27T00:01:00.000Z");
    const startsAt = "2026-08-26T02:40:00.000Z";
    const endsAt = "2026-08-27T02:40:00.000Z";
    const initial = claimedCampaign({
      status: "RETRY_WAIT",
      retryFromStatus: "PREPARING",
      stageAttempts: 1,
      lastErrorCode: "meta_operation_ledger_unavailable_error",
      collectionStartedAt: startsAt,
      collectionEndsAt: endsAt,
    });
    const renewed = claimedCampaign({
      status: "PREPARING",
      stageAttempts: 2,
      lastErrorCode: initial.lastErrorCode,
      collectionStartedAt: startsAt,
      collectionEndsAt: endsAt,
    });
    const store = mockStore(renewed);
    mocks.createMetaDraft.mockResolvedValue({});
    mocks.registerMetaAdRun.mockResolvedValue({ startsAt, endsAt });

    await expect(processClaimedCampaign({
      initialCampaign: initial,
      store: store.value,
      environment: {},
      now: () => retryNow,
    })).resolves.toBe("AWAITING_ACTIVATION");

    expect(mocks.registerMetaAdRun).toHaveBeenCalledWith(expect.objectContaining({
      policy: expect.objectContaining({ startsAt, endsAt }),
    }));
    expect(store.transition).toHaveBeenCalledWith(renewed, expect.objectContaining({
      status: "AWAITING_ACTIVATION",
      collectionStartedAt: startsAt,
      collectionEndsAt: endsAt,
    }));
  });
});
