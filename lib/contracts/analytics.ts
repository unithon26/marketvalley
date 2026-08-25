export type CampaignAnalyticsStatus = "not_connected" | "collecting" | "preliminary" | "final";

export type CampaignAnalytics = {
  status: CampaignAnalyticsStatus;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  spendMinor: number | null;
  currency: string | null;
  landingVisits: number;
  reservations: number;
  updatedAt: string | null;
};
export const emptyCampaignAnalytics: CampaignAnalytics = {
  status: "not_connected",
  impressions: null,
  reach: null,
  clicks: null,
  linkClicks: null,
  spendMinor: null,
  currency: null,
  landingVisits: 0,
  reservations: 0,
  updatedAt: null,
};
