"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuthUser } from "@/lib/contracts/auth";

export type AuthSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "not_configured" }
  | { status: "unavailable" };

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthUser>;
  return (
    typeof user.id === "string" &&
    (typeof user.email === "string" || user.email === null) &&
    (typeof user.displayName === "string" || user.displayName === null) &&
    (typeof user.avatarUrl === "string" || user.avatarUrl === null)
  );
}

export async function requestAuthSession(signal?: AbortSignal): Promise<AuthSessionState | null> {
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    const body = (await response.json()) as unknown;

    if (response.ok && body && typeof body === "object") {
      const session = body as { authenticated?: unknown; user?: unknown };
      if (session.authenticated === false && session.user === null) {
        return { status: "anonymous" };
      }
      if (session.authenticated === true && isAuthUser(session.user)) {
        return { status: "authenticated", user: session.user };
      }
    }

    const code =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: unknown } }).error?.code
        : null;
    return { status: code === "auth_not_configured" ? "not_configured" : "unavailable" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return { status: "unavailable" };
  }
}

export function useAuthSession(enabled = true) {
  const [state, setState] = useState<AuthSessionState>(
    enabled ? { status: "loading" } : { status: "not_configured" },
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ status: "not_configured" });
      return;
    }
    const nextState = await requestAuthSession();
    if (nextState) setState(nextState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void requestAuthSession(controller.signal).then((nextState) => {
      if (nextState) setState(nextState);
    });
    return () => controller.abort();
  }, [enabled]);

  return { state, refresh };
}
