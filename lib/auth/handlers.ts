import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthErrorCode, AuthSessionResponse } from "@/lib/contracts/auth";
import type { AuthContinuationStore } from "@/lib/auth/continuation";
import { isValidPkceFlowId } from "@/lib/auth/continuation";
import { SupabaseConfigurationError } from "@/lib/supabase/config";
import {
  authErrorUrl,
  isSameOriginMutation,
  privateNoStoreHeaders,
  resolveAppOrigin,
  sanitizeNextPath,
} from "@/lib/auth/security";
import { isMissingAuthSession, toAuthUser } from "@/lib/auth/user";

type CreateClient = () => Promise<SupabaseClient>;
type Environment = Record<string, string | undefined>;

type HandlerDependencies = {
  createClient: CreateClient;
  environment?: Environment;
};

type OAuthHandlerDependencies = HandlerDependencies & {
  continuations: AuthContinuationStore;
};

function redirect(url: URL | string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { ...privateNoStoreHeaders, Location: url.toString() },
  });
}

function usesCanonicalOrigin(request: Request, origin: string): boolean {
  if (new URL(request.url).origin !== origin) return false;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host")?.trim();
  if (!requestHost) return true;

  return requestHost.toLowerCase() === new URL(origin).host.toLowerCase();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { ...privateNoStoreHeaders, Vary: "Cookie" },
  });
}

function authError(code: AuthErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function configurationErrorResponse(): Response {
  return authError(
    "auth_not_configured",
    "로그인 설정이 아직 완료되지 않았습니다.",
    503,
  );
}

export async function handleGoogleSignIn(
  request: Request,
  dependencies: OAuthHandlerDependencies,
): Promise<Response> {
  let origin: string;
  try {
    origin = resolveAppOrigin(request.url, dependencies.environment);
    const requestUrl = new URL(request.url);
    if (!usesCanonicalOrigin(request, origin)) {
      const canonicalUrl = new URL("/auth/google", origin);
      canonicalUrl.search = requestUrl.search;
      return redirect(canonicalUrl);
    }

    const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
    const callbackUrl = new URL("/auth/callback", origin);

    const supabase = await dependencies.createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url || !isValidPkceFlowId(data.flowId)) {
      return redirect(authErrorUrl(origin, "login_failed"));
    }
    dependencies.continuations.set(data.flowId, next);
    return redirect(data.url);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return authError("login_failed", "Google 로그인을 시작하지 못했습니다.", 502);
  }
}

export async function handleAuthCallback(
  request: Request,
  dependencies: OAuthHandlerDependencies,
): Promise<Response> {
  let origin: string;
  try {
    origin = resolveAppOrigin(request.url, dependencies.environment);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return authError("callback_failed", "로그인 결과를 확인하지 못했습니다.", 502);
  }

  const url = new URL(request.url);
  const flowId = url.searchParams.get("sb_flow_id");
  if (url.searchParams.has("error")) {
    if (isValidPkceFlowId(flowId)) dependencies.continuations.take(flowId);
    return redirect(authErrorUrl(origin, "provider_denied"));
  }

  const code = url.searchParams.get("code");
  if (!code || !isValidPkceFlowId(flowId)) {
    return redirect(authErrorUrl(origin, "invalid_request"));
  }
  const next = dependencies.continuations.take(flowId) ?? "/";

  try {
    const supabase = await dependencies.createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, { flowId });
    if (error) return redirect(authErrorUrl(origin, "callback_failed"));
    return redirect(new URL(next, origin));
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return redirect(authErrorUrl(origin, "callback_failed"));
  }
}

export async function handleSession(
  dependencies: HandlerDependencies,
): Promise<Response> {
  try {
    const supabase = await dependencies.createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      if (isMissingAuthSession(error)) {
        const response: AuthSessionResponse = { authenticated: false, user: null };
        return json(response);
      }
      return authError("session_unavailable", "로그인 상태를 확인하지 못했습니다.", 503);
    }

    const response: AuthSessionResponse = data.user
      ? { authenticated: true, user: toAuthUser(data.user) }
      : { authenticated: false, user: null };
    return json(response);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return authError("session_unavailable", "로그인 상태를 확인하지 못했습니다.", 503);
  }
}

export async function handleLogout(
  request: Request,
  dependencies: HandlerDependencies,
): Promise<Response> {
  let origin: string;
  try {
    origin = resolveAppOrigin(request.url, dependencies.environment);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return authError("logout_failed", "로그아웃하지 못했습니다.", 502);
  }

  if (!isSameOriginMutation(request, origin)) {
    return authError("invalid_request", "허용되지 않은 로그아웃 요청입니다.", 403);
  }

  const next = sanitizeNextPath(new URL(request.url).searchParams.get("next"));
  try {
    const supabase = await dependencies.createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error && !isMissingAuthSession(error)) {
      return redirect(authErrorUrl(origin, "logout_failed"));
    }
    return redirect(new URL(next, origin), 303);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return configurationErrorResponse();
    return redirect(authErrorUrl(origin, "logout_failed"));
  }
}

export function handleAuthError(request: Request): Response {
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
  const code: AuthErrorCode = knownCodes.has(requestedCode as AuthErrorCode)
    ? (requestedCode as AuthErrorCode)
    : "callback_failed";

  return authError(code, "로그인을 완료하지 못했습니다. 다시 시도해주세요.", 400);
}
