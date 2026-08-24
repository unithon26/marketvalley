const visitorIdKey = "marketvalley:visitor-id";
const campaignDraftKeyPrefix = "marketvalley:campaign-draft:";

/** 브라우저별 익명 신원 토큰만 보관한다. 응답 상태 자체는 서버(API)가 갖고 있다. */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(visitorIdKey);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(visitorIdKey, created);
  return created;
}

/** 현재 브라우저가 만든 캠페인의 mock 소유 토큰을 보관한다. */
export function saveCampaignDraftId(campaignId: string, draftId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${campaignDraftKeyPrefix}${campaignId}`, draftId);
}

export function getCampaignDraftId(campaignId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${campaignDraftKeyPrefix}${campaignId}`);
}
