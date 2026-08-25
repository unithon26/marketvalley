import { describe, expect, it } from "vitest";

import { resolveCampaignEntryPath } from "@/components/campaign-entry-link";

describe("resolveCampaignEntryPath", () => {
  it("인증 미설정 fixture 경로는 세션 확인 없이 입력 화면으로 보낸다", () => {
    expect(resolveCampaignEntryPath(null, false)).toBe("/new");
    expect(resolveCampaignEntryPath({ status: "anonymous" }, false)).toBe("/new");
  });

  it("비로그인 사용자는 현재 화면을 보존하는 로그인 route로 보낸다", () => {
    expect(resolveCampaignEntryPath({ status: "anonymous" })).toBe("/login?next=%2Fnew");
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
