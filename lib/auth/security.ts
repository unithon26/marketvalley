import { SupabaseConfigurationError } from "@/lib/supabase/config";

type Environment = Record<string, string | undefined>;

export const defaultAfterAuthPath = "/";

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || value.length > 2_048) return defaultAfterAuthPath;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/u.test(value)) {
    return defaultAfterAuthPath;
  }

  try {
    const parsed = new URL(value, "https://marketvalley.local");
    if (parsed.origin !== "https://marketvalley.local") return defaultAfterAuthPath;
    if (parsed.pathname.startsWith("/auth/") || parsed.pathname.startsWith("/api/")) {
      return defaultAfterAuthPath;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultAfterAuthPath;
  }
}

function normalizeAppOrigin(rawValue: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new SupabaseConfigurationError("NEXT_PUBLIC_SITE_URL이 올바른 URL이 아닙니다.");
  }

  if (parsed.username || parsed.password) {
    throw new SupabaseConfigurationError("NEXT_PUBLIC_SITE_URL에 사용자 정보를 넣을 수 없습니다.");
  }

  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new SupabaseConfigurationError("배포 환경의 사이트 URL은 HTTPS여야 합니다.");
  }

  return parsed.origin;
}

export function resolveAppOrigin(
  requestUrl: string,
  environment: Environment = process.env,
): string {
  const configured = environment.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return normalizeAppOrigin(configured);

  const requestOrigin = new URL(requestUrl).origin;
  if (environment.NODE_ENV !== "production") {
    const parsedRequestUrl = new URL(requestUrl);
    if (["localhost", "127.0.0.1"].includes(parsedRequestUrl.hostname)) {
      return normalizeAppOrigin(requestOrigin);
    }
  }

  throw new SupabaseConfigurationError(
    "배포 환경에서는 NEXT_PUBLIC_SITE_URL을 명시해야 합니다.",
  );
}

export function isSameOriginMutation(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function authErrorUrl(origin: string, code: string, nextPath?: string | null): URL {
  const url = new URL("/auth/error", origin);
  url.searchParams.set("code", code);
  if (nextPath) url.searchParams.set("next", sanitizeNextPath(nextPath));
  return url;
}

export const privateNoStoreHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
} as const;
