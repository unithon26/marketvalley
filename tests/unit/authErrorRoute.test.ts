import { describe, expect, it } from "vitest";

import { handleAuthErrorRedirect } from "@/app/auth/error/route";

const environment = {
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example",
  NODE_ENV: "production",
};

describe("auth error route", () => {
  it("알려진 OAuth 오류를 로그인 화면의 복구 상태로 보낸다", async () => {
    const response = handleAuthErrorRedirect(
      new Request("https://attacker.example/auth/error?code=provider_denied&next=%2Fcampaigns%2Fdemo"),
      environment,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://marketvalley.example/login?next=%2Fcampaigns%2Fdemo&error=provider_denied",
    );
  });

  it("알 수 없는 오류 코드는 일반 callback 오류로 제한한다", async () => {
    const response = handleAuthErrorRedirect(
      new Request("https://attacker.example/auth/error?code=unexpected&next=https%3A%2F%2Fevil.example"),
      environment,
    );

    expect(response.headers.get("location")).toBe(
      "https://marketvalley.example/login?next=%2F&error=callback_failed",
    );
  });
});
