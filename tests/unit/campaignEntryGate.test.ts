import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "@/lib/auth/authorization";
import { resolveCampaignEntryGate } from "@/lib/auth/campaignEntryGate";

describe("campaign entry gate", () => {
  it("인증 설정이 없는 fixture 발표 경로는 허용한다", async () => {
    const requireIdentity = vi.fn();
    await expect(resolveCampaignEntryGate({
      hasConfiguration: () => false,
      requireIdentity,
    })).resolves.toBe("allow");
    expect(requireIdentity).not.toHaveBeenCalled();
  });

  it("설정된 제품 환경의 익명 사용자는 로그인 화면으로 보낸다", async () => {
    await expect(resolveCampaignEntryGate({
      hasConfiguration: () => true,
      requireIdentity: async () => { throw new AuthenticationRequiredError(); },
    })).resolves.toBe("authentication_required");
  });

  it("부분 설정과 세션 장애를 허용 상태로 축약하지 않는다", async () => {
    await expect(resolveCampaignEntryGate({
      hasConfiguration: () => { throw new Error("invalid config"); },
      requireIdentity: vi.fn(),
    })).resolves.toBe("auth_not_configured");

    await expect(resolveCampaignEntryGate({
      hasConfiguration: () => true,
      requireIdentity: async () => { throw new Error("provider unavailable"); },
    })).resolves.toBe("session_unavailable");
  });

  it("검증된 세션만 입력 화면을 허용한다", async () => {
    await expect(resolveCampaignEntryGate({
      hasConfiguration: () => true,
      requireIdentity: async () => ({ userId: "user-1" }),
    })).resolves.toBe("allow");
  });
});
