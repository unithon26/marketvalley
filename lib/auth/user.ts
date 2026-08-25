import type { User } from "@supabase/supabase-js";

import type { AuthUser } from "@/lib/contracts/auth";

function safeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized && normalized.length <= 200 ? normalized : null;
}

function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: safeDisplayName(user.user_metadata.full_name ?? user.user_metadata.name),
    avatarUrl: safeAvatarUrl(user.user_metadata.avatar_url ?? user.user_metadata.picture),
  };
}

export function isMissingAuthSession(error: unknown): boolean {
  return error instanceof Error && error.name === "AuthSessionMissingError";
}
