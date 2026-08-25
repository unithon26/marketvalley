"use client";

import { usePathname } from "next/navigation";

import { GoogleIcon } from "@/components/google-icon";
import { useAuthSession } from "@/lib/client/use-auth-session";

function initials(name: string | null, email: string | null): string {
  const source = name ?? email ?? "MV";
  return source.trim().slice(0, 2).toUpperCase();
}

// GNB 표현과 endpoint 상태 해석을 분리해 인증 계약을 시각 변경과 독립시킨다.
export function AuthControls({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const { state, refresh } = useAuthSession(enabled);

  if (state.status === "loading") {
    return <span className="auth-loading" role="status"><span className="sr-only">로그인 상태 확인 중</span></span>;
  }

  if (state.status === "not_configured") {
    return <button className="auth-button auth-button-muted" type="button" disabled>로그인 준비 중</button>;
  }

  if (state.status === "unavailable") {
    return <button className="auth-button auth-button-muted" type="button" onClick={refresh}>로그인 다시 확인</button>;
  }

  if (state.status === "anonymous") {
    const next = pathname.startsWith("/auth/") || pathname.startsWith("/api/") ? "/" : pathname;
    return (
      <a className="auth-button auth-login-button" href={`/auth/google?next=${encodeURIComponent(next)}`}>
        <GoogleIcon size={16} />
        <span>Google로 로그인</span>
      </a>
    );
  }

  const label = state.user.displayName ?? state.user.email ?? "로그인 사용자";
  return (
    <div className="auth-user">
      <span className="auth-avatar" aria-hidden="true">
        {initials(state.user.displayName, state.user.email)}
      </span>
      <span className="auth-user-copy" title={label}>
        <strong>{label}</strong>
        <small>Google 계정</small>
      </span>
      <form action="/auth/logout?next=%2F" method="post">
        <button className="auth-button auth-logout-button" type="submit">로그아웃</button>
      </form>
    </div>
  );
}
