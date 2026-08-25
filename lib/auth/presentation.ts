import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthSessionResponse, AuthUser } from "@/lib/contracts/auth";
import {
  isSameOriginMutation,
  privateNoStoreHeaders,
  resolveAppOrigin,
  sanitizeNextPath,
} from "@/lib/auth/security";

const presentationAuthCookieName = "marketvalley-presentation-auth";
const presentationAuthCookieValue = "authenticated";

type Environment = Record<string, string | undefined>;

export const presentationAuthUser: AuthUser = {
  id: "presentation-user",
  email: "demo@marketvalley.local",
  displayName: "마켓밸리 데모",
  avatarUrl: null,
};

function setPresentationCookie(response: NextResponse, origin: string, value: string, maxAge: number) {
  response.cookies.set({
    name: presentationAuthCookieName,
    value,
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: new URL(origin).protocol === "https:",
  });
}

export async function hasPresentationAuthSession(): Promise<boolean> {
  return (await cookies()).get(presentationAuthCookieName)?.value === presentationAuthCookieValue;
}

export function beginPresentationGoogleSignIn(
  request: Request,
  environment: Environment = process.env,
): Response {
  const origin = resolveAppOrigin(request.url, environment);
  const next = sanitizeNextPath(new URL(request.url).searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, origin), 302);
  for (const [name, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(name, value);
  setPresentationCookie(response, origin, presentationAuthCookieValue, 60 * 60 * 8);
  return response;
}

export function presentationSessionResponse(authenticated: boolean): Response {
  const body: AuthSessionResponse = authenticated
    ? { authenticated: true, user: presentationAuthUser }
    : { authenticated: false, user: null };
  return Response.json(body, {
    headers: { ...privateNoStoreHeaders, Vary: "Cookie" },
  });
}

export function endPresentationSession(
  request: Request,
  environment: Environment = process.env,
): Response {
  const origin = resolveAppOrigin(request.url, environment);
  if (!isSameOriginMutation(request, origin)) {
    return Response.json(
      { error: { code: "invalid_request", message: "허용되지 않은 로그아웃 요청입니다." } },
      { status: 403, headers: privateNoStoreHeaders },
    );
  }

  const next = sanitizeNextPath(new URL(request.url).searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, origin), 303);
  for (const [name, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(name, value);
  setPresentationCookie(response, origin, "", 0);
  return response;
}
