import { describe, expect, it } from "vitest";

import {
  calculateRate,
  classifyMarketFit,
} from "@/lib/demo/reportMetrics";
import { emptyCampaignAnalytics } from "@/lib/contracts/analytics";

describe("real report metrics", () => {
  it.each([
    [1, 200, 0.5],
    [2, 100, 2],
    [3, 100, 3],
  ] as const)("%s/%s를 %s%%로 계산한다", (numerator, denominator, expected) => {
    expect(calculateRate(numerator, denominator)).toBe(expected);
  });

  it("실제 Meta 노출이 없으면 시장 적합성을 주장하지 않는다", () => {
    expect(classifyMarketFit(emptyCampaignAnalytics)).toBe("pending");
  });

  it("실제 링크 클릭과 노출로만 판정한다", () => {
    expect(classifyMarketFit({
      ...emptyCampaignAnalytics,
      status: "preliminary",
      impressions: 100,
      linkClicks: 3,
    })).toBe("very-suitable");
  });
});
