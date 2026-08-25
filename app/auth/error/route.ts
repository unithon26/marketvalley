import type { AuthErrorCode } from "@/lib/contracts/auth";
import { resolveAppOrigin, sanitizeNextPath } from "@/lib/auth/security";

export const runtime = "nodejs";

type Environment = Record<string, string | undefined>;

export function handleAuthErrorRedirect(
  request: Request,
  environment: Environment = process.env,
): Response {
  const requestedCode = new URL(request.url).searchParams.get("code");
  const knownCodes = new Set<AuthErrorCode>([
    "auth_not_configured",
    "callback_failed",
    "invalid_request",
    "login_failed",
    "logout_failed",
    "provider_denied",
    "session_unavailable",
  ]);
  const code = knownCodes.has(requestedCode as AuthErrorCode)
    ? requestedCode
    : "callback_failed";
  const requestUrl = new URL(request.url);
  const destination = new URL("/login", resolveAppOrigin(request.url, environment));
  destination.searchParams.set("next", sanitizeNextPath(requestUrl.searchParams.get("next")));
  destination.searchParams.set("error", code ?? "callback_failed");
  return Response.redirect(destination, 302);
}

export async function GET(request: Request): Promise<Response> {
  return handleAuthErrorRedirect(request);
}
