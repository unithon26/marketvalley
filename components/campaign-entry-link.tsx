"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

import type { AuthSessionState } from "@/lib/client/use-auth-session";
import { requestAuthSession } from "@/lib/client/use-auth-session";
import { hasBundledAuthMode, hasBundledPresentationAuthMode } from "@/lib/auth/mode";

const newCampaignPath = "/new";
const googleLoginPath = "/auth/google?next=%2Fnew";
const presentationLoginPath = "/login?next=%2Fnew";

export function resolveCampaignEntryPath(
  state: AuthSessionState | null,
  authEnabled = true,
  presentationMode = false,
): string {
  if (!authEnabled) return newCampaignPath;
  if (state?.status !== "anonymous") return newCampaignPath;
  return presentationMode ? presentationLoginPath : googleLoginPath;
}

type CampaignEntryLinkProps = {
  children: ReactNode;
  className?: string;
};

export function CampaignEntryLink({ children, className }: CampaignEntryLinkProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const authEnabled = hasBundledAuthMode();
  const presentationMode = hasBundledPresentationAuthMode();

  async function enterCampaign(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    if (!authEnabled) return;

    event.preventDefault();
    if (checking) return;

    setChecking(true);
    const session = await requestAuthSession();
    setChecking(false);
    const nextPath = resolveCampaignEntryPath(session, authEnabled, presentationMode);

    if (nextPath === googleLoginPath) {
      window.location.assign(nextPath);
      return;
    }

    router.push(nextPath);
  }

  return (
    <Link
      className={className}
      href={newCampaignPath}
      onClick={enterCampaign}
      aria-busy={checking}
    >
      {children}
    </Link>
  );
}
