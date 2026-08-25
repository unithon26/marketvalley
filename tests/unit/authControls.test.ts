import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthSessionMock } = vi.hoisted(() => ({ useAuthSessionMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/campaigns/demo" }));
vi.mock("@/lib/client/use-auth-session", () => ({ useAuthSession: useAuthSessionMock }));

import { AuthControls } from "@/components/auth-controls";

describe("AuthControls", () => {
  beforeEach(() => {
    useAuthSessionMock.mockReset();
  });

  it("비로그인 상태에서 현재 화면으로 돌아오는 Google 로그인 링크를 제공한다", () => {
    useAuthSessionMock.mockReturnValue({ state: { status: "anonymous" }, refresh: vi.fn() });
    const html = renderToStaticMarkup(createElement(AuthControls, { enabled: true }));

    expect(html).toContain("Google로 로그인");
    expect(html).toContain('href="/auth/google?next=%2Fcampaigns%2Fdemo"');
  });

  it("로그인 상태에서 최소 프로필과 POST 로그아웃 버튼을 제공한다", () => {
    useAuthSessionMock.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "user-1",
          email: "owner@example.com",
          displayName: "홍성주",
          avatarUrl: null,
        },
      },
      refresh: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(AuthControls, { enabled: true }));

    expect(html).toContain("홍성주");
    expect(html).toContain("로그아웃");
    expect(html).toContain('action="/auth/logout?next=%2Fcampaigns%2Fdemo"');
    expect(html).toContain('method="post"');
  });

  it("미설정과 장애 상태를 각각 안전한 fallback으로 표시한다", () => {
    useAuthSessionMock.mockReturnValue({
      state: { status: "not_configured" },
      refresh: vi.fn(),
    });
    expect(
      renderToStaticMarkup(createElement(AuthControls, { enabled: false })),
    ).toContain("로그인 준비 중");

    useAuthSessionMock.mockReturnValue({ state: { status: "unavailable" }, refresh: vi.fn() });
    expect(
      renderToStaticMarkup(createElement(AuthControls, { enabled: true })),
    ).toContain("로그인 다시 확인");
  });
});
