const visitorIdKey = "marketvalley:visitor-id";

/** 브라우저별 익명 신원 토큰만 보관한다. 응답 상태 자체는 서버(API)가 갖고 있다. */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(visitorIdKey);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(visitorIdKey, created);
  return created;
}
