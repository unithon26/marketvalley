import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/login-panel";
import {
  AuthenticationRequiredError,
  requireVerifiedIdentity,
} from "@/lib/auth/authorization";
import { sanitizeNextPath } from "@/lib/auth/security";
import { getOptionalSupabaseConfig } from "@/lib/supabase/config";

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
  let errorCode = first(params.error);
  let authEnabled = false;
  let authenticated = false;

  try {
    authEnabled = getOptionalSupabaseConfig() !== null;
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
      nextPath={nextPath}
      errorCode={errorCode}
      modal={modal}
    />
  );
}
