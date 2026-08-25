export type MarketFit = "unsuitable" | "suitable" | "very-suitable";

export type MarketReportMetrics = {
  impressions: number;
  ctr: number;
  reservationRate: number;
  funnel: {
    impressions: number;
    clicks: number;
    landingVisits: number;
    reservations: number;
  };
};

export function classifyMarketFitByCtr(ctr: number): MarketFit {
  if (!Number.isFinite(ctr) || ctr < 1) return "unsuitable";
  if (ctr < 3) return "suitable";
  return "very-suitable";
}

/** Meta 연동 전 발표 화면에서 사용하는 결정적 목데이터입니다. */
export const demoMarketReportMetrics: MarketReportMetrics = {
  impressions: 1_800_820,
  ctr: 12.6,
  reservationRate: 4,
  funnel: {
    impressions: 1_493_211,
    clicks: 400_033,
    landingVisits: 433,
    reservations: 2,
  },
};
