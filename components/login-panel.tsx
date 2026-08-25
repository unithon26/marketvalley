import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { GoogleIcon } from "@/components/google-icon";

const loginErrors: Record<string, string> = {
  auth_not_configured: "로그인 설정이 아직 완료되지 않았어요.",
  callback_failed: "로그인 결과를 확인하지 못했어요. 다시 시도해주세요.",
  invalid_request: "로그인 요청이 만료됐어요. 다시 시작해주세요.",
  login_failed: "Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
  logout_failed: "로그아웃을 완료하지 못했어요. 로그인 상태를 다시 확인해주세요.",
  provider_denied: "Google 로그인이 취소됐어요. 원할 때 다시 시도할 수 있어요.",
  session_unavailable: "로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
};

type LoginPanelProps = {
  authenticated?: boolean;
  enabled: boolean;
  nextPath: string;
  errorCode?: string | null;
};

export function LoginPanel({ authenticated = false, enabled, nextPath, errorCode = null }: LoginPanelProps) {
  const errorMessage = errorCode ? loginErrors[errorCode] : null;

  return (
    <div className="login-shell">
      <header className="login-header">
        <Link href="/" aria-label="marketvalley 홈">
          <BrandLogo priority />
        </Link>
      </header>

      <main className="login-stage">
        <div className="login-dashboard-preview" aria-hidden="true">
          <div className="login-preview-title" />
          <div className="login-preview-tabs"><i /><i /></div>
          <div className="login-preview-grid"><i /><i /><i /></div>
        </div>
        <div className="login-dim" />

        <section className="login-card" aria-labelledby="login-title">
          <BrandLogo />
          <div className="login-copy">
            <h1 id="login-title">시장 검증을 시작하려면<br />로그인이 필요해요</h1>
            <p>아래 버튼을 누르면 Google 계정으로 안전하게 로그인할 수 있어요.</p>
          </div>
          {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
          {authenticated ? (
            <Link className="google-login-button" href={nextPath}>
              <span>로그인 상태로 계속하기</span>
            </Link>
          ) : enabled ? (
            <a className="google-login-button" href={`/auth/google?next=${encodeURIComponent(nextPath)}`}>
              <GoogleIcon />
              <span>Google 계정으로 로그인</span>
            </a>
          ) : (
            <button className="google-login-button" type="button" disabled>
              <GoogleIcon />
              <span>로그인 준비 중</span>
            </button>
          )}
          <p className="login-footnote">로그인 후 작성하던 화면으로 바로 돌아갑니다.</p>
        </section>
      </main>
    </div>
  );
}
