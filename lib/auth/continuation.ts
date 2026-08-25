import { cookies } from "next/headers";

import { sanitizeNextPath } from "@/lib/auth/security";

const flowIdPattern = /^[A-Za-z0-9_-]{8,64}$/u;
const cookiePrefix = "mv-auth-next-";
const continuationLifetimeSeconds = 10 * 60;

export type AuthContinuationStore = {
  set(flowId: string, nextPath: string): void;
  take(flowId: string): string | null;
};

export function isValidPkceFlowId(value: string | null | undefined): value is string {
  return typeof value === "string" && flowIdPattern.test(value);
}

function cookieName(flowId: string): string {
  if (!isValidPkceFlowId(flowId)) throw new Error("Invalid PKCE flow id");
  return `${cookiePrefix}${flowId}`;
}

function continuationCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/auth/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function createAuthContinuationStore(): Promise<AuthContinuationStore> {
  const cookieStore = await cookies();

  return {
    set(flowId, nextPath) {
      cookieStore.set(
        cookieName(flowId),
        encodeURIComponent(sanitizeNextPath(nextPath)),
        continuationCookieOptions(continuationLifetimeSeconds),
      );
    },
    take(flowId) {
      const name = cookieName(flowId);
      const value = cookieStore.get(name)?.value;
      cookieStore.set(name, "", continuationCookieOptions(0));
      if (!value) return null;

      try {
        return sanitizeNextPath(decodeURIComponent(value));
      } catch {
        return null;
      }
    },
  };
}
