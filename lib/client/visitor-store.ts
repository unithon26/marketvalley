const visitorStorageKey = "marketvalley:visitor-id";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(visitorStorageKey)?.trim();
  if (existing && /^[0-9a-f-]{36}$/iu.test(existing)) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(visitorStorageKey, created);
  return created;
}
