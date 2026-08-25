import { describe, expect, it } from "vitest";

import { resolveCampaignEntryPath } from "@/components/campaign-entry-link";

describe("resolveCampaignEntryPath", () => {
  it("인증 미설정 fixture 경로는 세션 확인 없이 입력 화면으로 보낸다", () => {
    expect(resolveCampaignEntryPath(null, false)).toBe("/new");
    expect(resolveCampaignEntryPath({ status: "anonymous" }, false)).toBe("/new");
  });

  it("비로그인 사용자는 입력 화면 복귀 경로를 보존한 Google OAuth로 바로 보낸다", () => {
    expect(resolveCampaignEntryPath({ status: "anonymous" })).toBe("/auth/google?next=%2Fnew");
  });

  it("발표 모드의 비로그인 사용자는 메인 위 Google 로그인 모달로 보낸다", () => {
    expect(resolveCampaignEntryPath({ status: "anonymous" }, true, true))
      .toBe("/login?next=%2Fnew");
  });

  it("로그인 상태와 인증 장애는 서버의 기존 /new 경계로 보낸다", () => {
    expect(resolveCampaignEntryPath({
      status: "authenticated",
      user: { id: "user-1", email: null, displayName: null, avatarUrl: null },
    })).toBe("/new");
    expect(resolveCampaignEntryPath({ status: "unavailable" })).toBe("/new");
    expect(resolveCampaignEntryPath(null)).toBe("/new");
  });
});
