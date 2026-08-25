import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

import { LoginPanel } from "@/components/login-panel";

describe("LoginPanel", () => {
  it("Figma 확정 로고와 원래 화면으로 돌아오는 Google 로그인 CTA를 제공한다", () => {
    const html = renderToStaticMarkup(createElement(LoginPanel, {
      enabled: true,
      nextPath: "/new",
    }));

    expect(html).toContain("/brand/marketvalley-logo.svg");
    expect(html).toContain("시장 검증을 시작하려면");
    expect(html).toContain("Google 계정으로 로그인");
    expect(html).toContain('href="/auth/google?next=%2Fnew"');
  });

  it("인증 미설정과 OAuth 취소를 안전한 상태로 설명한다", () => {
    const disabled = renderToStaticMarkup(createElement(LoginPanel, {
      enabled: false,
      nextPath: "/new",
    }));
    expect(disabled).toContain("로그인 준비 중");
    expect(disabled).toContain("disabled");

    const denied = renderToStaticMarkup(createElement(LoginPanel, {
      enabled: true,
      nextPath: "/new",
      errorCode: "provider_denied",
    }));
    expect(denied).toContain("Google 로그인이 취소됐어요");
  });

  it("모달에서는 별도 미리보기 대신 현재 화면 위 대화상자를 렌더링한다", () => {
    const html = renderToStaticMarkup(createElement(LoginPanel, {
      enabled: true,
      nextPath: "/new",
      modal: true,
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("login-modal-backdrop");
    expect(html).not.toContain("login-dashboard-preview");
  });

  it("로그아웃 실패 뒤 남은 세션을 숨기지 않고 계속 경로를 제공한다", () => {
    const html = renderToStaticMarkup(createElement(LoginPanel, {
      authenticated: true,
      enabled: true,
      nextPath: "/campaigns/demo",
      errorCode: "logout_failed",
    }));

    expect(html).toContain("로그아웃을 완료하지 못했어요");
    expect(html).toContain("로그인 상태로 계속하기");
    expect(html).toContain('href="/campaigns/demo"');
    expect(html).not.toContain("Google 계정으로 로그인");
  });
});
