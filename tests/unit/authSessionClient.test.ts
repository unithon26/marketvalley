import { afterEach, describe, expect, it, vi } from "vitest";

import { requestAuthSession } from "@/lib/client/use-auth-session";

function response(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

describe("requestAuthSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("정상 비로그인과 로그인 응답을 UI 상태로 변환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { authenticated: false, user: null }))
      .mockResolvedValueOnce(response(200, {
        authenticated: true,
        user: {
          id: "user-1",
          email: "owner@example.com",
          displayName: "홍성주",
          avatarUrl: null,
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestAuthSession()).resolves.toEqual({ status: "anonymous" });
    await expect(requestAuthSession()).resolves.toEqual({
      status: "authenticated",
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "홍성주",
        avatarUrl: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
    }));
  });

  it("미설정, 잘못된 응답과 네트워크 장애를 구분한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503, { error: { code: "auth_not_configured" } }))
      .mockResolvedValueOnce(response(200, { authenticated: true, user: { id: 1 } }))
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestAuthSession()).resolves.toEqual({ status: "not_configured" });
    await expect(requestAuthSession()).resolves.toEqual({ status: "unavailable" });
    await expect(requestAuthSession()).resolves.toEqual({ status: "unavailable" });
  });

  it("화면 이탈로 취소된 요청은 오류 상태를 덮어쓰지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );

    await expect(requestAuthSession()).resolves.toBeNull();
  });
});
