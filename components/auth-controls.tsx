"use client";

import { usePathname } from "next/navigation";

import { useAuthSession } from "@/lib/client/use-auth-session";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.7 3-4.3 3-7.5Z" />
      <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.6-2.3l-3.2-2.6c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.5 14a6 6 0 0 1 0-4V7.3H3.2a10 10 0 0 0 0 9.5L6.5 14Z" />
      <path fill="#ea4335" d="M12 5.9c1.6 0 3 .5 4.1 1.6L19 4.6A9.7 9.7 0 0 0 3.2 7.3L6.5 10A5.8 5.8 0 0 1 12 5.9Z" />
    </svg>
  );
}

function initials(name: string | null, email: string | null): string {
  const source = name ?? email ?? "MV";
  return source.trim().slice(0, 2).toUpperCase();
}

// 디자인 확정본이 오면 이 컴포넌트의 markup과 auth-* CSS만 교체한다.
// endpoint 호출과 상태 해석은 useAuthSession에 남겨 시각 변경과 분리한다.
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
        <GoogleIcon />
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
