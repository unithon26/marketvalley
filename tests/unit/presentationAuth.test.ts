import { describe, expect, it } from "vitest";

import {
  beginPresentationGoogleSignIn,
  endPresentationSession,
  presentationSessionResponse,
} from "@/lib/auth/presentation";

const environment = {
  NODE_ENV: "development",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("presentation auth", () => {
  it("Google 진입 형태를 유지하면서 HttpOnly 목 세션을 만들고 내부 경로로 이동한다", () => {
    const response = beginPresentationGoogleSignIn(
      new Request("http://localhost:3000/auth/google?next=%2Fnew"),
      environment,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/new");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("marketvalley-presentation-auth=authenticated");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("외부 이동 경로를 홈으로 제한하고 세션 API에는 목 사용자 최소 정보만 노출한다", async () => {
    const signIn = beginPresentationGoogleSignIn(
      new Request("http://localhost:3000/auth/google?next=https://attacker.example"),
      environment,
    );
    expect(signIn.headers.get("location")).toBe("http://localhost:3000/");

    await expect(presentationSessionResponse(true).json()).resolves.toEqual({
      authenticated: true,
      user: {
        id: "presentation-user",
        email: "demo@marketvalley.local",
        displayName: "마켓밸리 데모",
        avatarUrl: null,
      },
    });
    await expect(presentationSessionResponse(false).json()).resolves.toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("same-origin POST 로그아웃만 목 세션을 지운다", () => {
    const logout = endPresentationSession(
      new Request("http://localhost:3000/auth/logout?next=%2F", {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
      }),
      environment,
    );
    expect(logout.status).toBe(303);
    expect(logout.headers.get("set-cookie")).toContain("marketvalley-presentation-auth=");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const rejected = endPresentationSession(
      new Request("http://localhost:3000/auth/logout", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      }),
      environment,
    );
    expect(rejected.status).toBe(403);
  });
});
