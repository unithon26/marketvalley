import type { CampaignAnalytics } from "@/lib/contracts/analytics";
import type { ReservationSummary } from "@/lib/contracts/repository";

export type PresentationReportSnapshot = {
  analytics: CampaignAnalytics;
  summary: ReservationSummary;
  collectedHours: number;
};

const exampleReservations = [
  ["예시 예약자 1", "presentation01@example.invalid"],
  ["예시 예약자 2", "presentation02@example.invalid"],
  ["예시 예약자 3", "presentation03@example.invalid"],
  ["예시 예약자 4", "presentation04@example.invalid"],
  ["예시 예약자 5", "presentation05@example.invalid"],
  ["예시 예약자 6", "presentation06@example.invalid"],
  ["예시 예약자 7", "presentation07@example.invalid"],
  ["예시 예약자 8", "presentation08@example.invalid"],
] as const;

export function createPresentationReportSnapshot(
  campaignId: string,
  publishedAt: string,
): PresentationReportSnapshot {
  const publishedTime = Date.parse(publishedAt);
  const validPublishedTime = Number.isFinite(publishedTime)
    ? publishedTime
    : Date.parse("2026-08-26T00:00:00.000Z");
  const collectedHours = 24;
  const collectedAt = new Date(validPublishedTime + collectedHours * 60 * 60 * 1_000);

  const recent = exampleReservations.map(([name, email], index) => ({
    id: `${campaignId}-presentation-reservation-${index + 1}`,
    name,
    email,
    utm: {
      source: "instagram",
      medium: "paid_social",
      campaign: "presentation-example",
      content: `carousel-${(index % 5) + 1}`,
    },
    reservedAt: new Date(collectedAt.getTime() - index * 83 * 60 * 1_000).toISOString(),
  }));

  return {
    collectedHours,
    analytics: {
      status: "final",
      impressions: 1_920,
      reach: 1_486,
      clicks: 76,
      linkClicks: 63,
      spendMinor: 4_870,
      currency: "KRW",
      landingVisits: 51,
      reservations: recent.length,
      updatedAt: collectedAt.toISOString(),
    },
    summary: {
      total: recent.length,
      recent,
    },
  };
}
