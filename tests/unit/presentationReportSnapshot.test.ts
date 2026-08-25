import { describe, expect, it } from "vitest";

import { calculateRate, classifyMarketFit } from "@/lib/demo/reportMetrics";
import { createPresentationReportSnapshot } from "@/lib/presentation/reportSnapshot";

describe("presentation report snapshot", () => {
  it("keeps the 24-hour example deterministic and internally consistent", () => {
    const snapshot = createPresentationReportSnapshot(
      "campaign-1",
      "2026-08-26T00:00:00.000Z",
    );

    expect(snapshot.collectedHours).toBe(24);
    expect(snapshot.analytics.updatedAt).toBe("2026-08-27T00:00:00.000Z");
    expect(snapshot.analytics.reservations).toBe(snapshot.summary.total);
    expect(snapshot.summary.recent).toHaveLength(8);
    expect(snapshot.summary.recent.every((record) => record.name.startsWith("예시 예약자"))).toBe(true);
    expect(snapshot.summary.recent.every((record) => record.email.endsWith(".invalid"))).toBe(true);
    expect(calculateRate(snapshot.analytics.linkClicks, snapshot.analytics.impressions)).toBe(3.28);
    expect(calculateRate(snapshot.analytics.reservations, snapshot.analytics.landingVisits)).toBe(15.69);
    expect(classifyMarketFit(snapshot.analytics)).toBe("very-suitable");
  });
});
