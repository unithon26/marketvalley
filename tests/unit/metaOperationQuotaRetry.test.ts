import { describe, expect, it } from "vitest";

import {
  LEGACY_META_OPERATION_QUOTA_ERROR_CODE,
  META_OPERATION_QUOTA_ERROR_CODE,
  isMetaOperationQuotaErrorCode,
  metaOperationQuotaRetryPlan,
  needsFreshMetaDraftWindow,
} from "@/lib/lifecycle/metaOperationQuotaRetry";

describe("Meta operation quota retry", () => {
  it("waits until one minute after the next UTC quota date begins", () => {
    const plan = metaOperationQuotaRetryPlan(new Date("2026-08-26T02:33:55.000Z"));

    expect(plan).toEqual({
      nextAttemptAt: "2026-08-27T00:01:00.000Z",
      lastErrorCode: META_OPERATION_QUOTA_ERROR_CODE,
      lastErrorMessage: "설정된 광고 생성 일일 한도에 도달했습니다. 8월 27일 09:01 이후 자동으로 다시 시도합니다.",
    });
  });

  it("rolls over month and year boundaries", () => {
    expect(metaOperationQuotaRetryPlan(new Date("2026-12-31T23:59:59.000Z")).nextAttemptAt)
      .toBe("2027-01-01T00:01:00.000Z");
  });

  it("recognizes both canonical and already-persisted error codes", () => {
    expect(isMetaOperationQuotaErrorCode(META_OPERATION_QUOTA_ERROR_CODE)).toBe(true);
    expect(isMetaOperationQuotaErrorCode(LEGACY_META_OPERATION_QUOTA_ERROR_CODE)).toBe(true);
    expect(isMetaOperationQuotaErrorCode("anthropic_unsafe_output")).toBe(false);
    expect(isMetaOperationQuotaErrorCode(null)).toBe(false);
  });

  it("refreshes a draft window after a quota wait instead of shortening collection", () => {
    const now = new Date("2026-08-27T00:01:00.000Z");

    expect(needsFreshMetaDraftWindow({
      startsAt: "2026-08-26T02:40:00.000Z",
      endsAt: "2026-08-27T02:40:00.000Z",
      now,
      afterQuotaWait: true,
    })).toBe(true);
    expect(needsFreshMetaDraftWindow({
      startsAt: "2026-08-27T00:10:00.000Z",
      endsAt: "2026-08-28T00:10:00.000Z",
      now,
      afterQuotaWait: true,
    })).toBe(false);
  });

  it("preserves an operation schedule during non-quota crash recovery", () => {
    expect(needsFreshMetaDraftWindow({
      startsAt: "2026-08-26T02:40:00.000Z",
      endsAt: "2026-08-27T02:40:00.000Z",
      now: new Date("2026-08-27T00:01:00.000Z"),
      afterQuotaWait: false,
    })).toBe(false);
  });

  it("rejects an invalid worker clock", () => {
    expect(() => metaOperationQuotaRetryPlan(new Date(Number.NaN)))
      .toThrow("now must be a valid date");
  });
});
