import { describe, expect, it } from "vitest";

import {
  classifyMarketFitByCtr,
  demoMarketReportMetrics,
} from "@/lib/demo/reportMetrics";

describe("classifyMarketFitByCtr", () => {
  it.each([
    [0, "unsuitable"],
    [0.99, "unsuitable"],
    [1, "suitable"],
    [2.99, "suitable"],
    [3, "very-suitable"],
    [12.6, "very-suitable"],
  ] as const)("CTR %s%%를 %s로 판정한다", (ctr, expected) => {
    expect(classifyMarketFitByCtr(ctr)).toBe(expected);
  });

  it("발표용 목데이터는 매우 적합 화면을 노출한다", () => {
    expect(classifyMarketFitByCtr(demoMarketReportMetrics.ctr)).toBe("very-suitable");
  });
});
