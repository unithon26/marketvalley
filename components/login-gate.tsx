import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/login-panel";
import {
  AuthenticationRequiredError,
  requireVerifiedIdentity,
} from "@/lib/auth/authorization";
import { resolveAuthMode } from "@/lib/auth/mode";
import { sanitizeNextPath } from "@/lib/auth/security";

export type LoginSearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
}>;

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function LoginGate({
  modal = false,
  searchParams,
}: {
  modal?: boolean;
  searchParams: LoginSearchParams;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(first(params.next));
  let loginNextPath = nextPath;
  let errorCode = first(params.error);
  let authEnabled = false;
  let authenticated = false;

  try {
    const authMode = resolveAuthMode();
    authEnabled = authMode !== "disabled";
    if (authMode === "mock") loginNextPath = "/";
  } catch {
    errorCode ??= "auth_not_configured";
  }

  if (authEnabled) {
    try {
      await requireVerifiedIdentity();
      authenticated = true;
    } catch (error) {
      if (!(error instanceof AuthenticationRequiredError)) {
        errorCode ??= "session_unavailable";
      }
    }
  }
  if (authenticated && !errorCode) redirect(nextPath);

  return (
    <LoginPanel
      authenticated={authenticated}
      enabled={authEnabled}
      loginNextPath={loginNextPath}
      nextPath={nextPath}
      errorCode={errorCode}
      modal={modal}
    />
  );
}
