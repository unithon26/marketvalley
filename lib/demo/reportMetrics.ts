import type { CampaignAnalytics } from "@/lib/contracts/analytics";

export type MarketFit = "pending" | "unsuitable" | "suitable" | "very-suitable";

export function calculateRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function classifyMarketFit(metrics: CampaignAnalytics): MarketFit {
  const ctr = calculateRate(metrics.linkClicks, metrics.impressions);
  if (ctr === null) return "pending";
  if (ctr < 1) return "unsuitable";
  if (ctr < 3) return "suitable";
  return "very-suitable";
}
