import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/reservations/route";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3100/api/reservations", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

describe("public reservation route security", () => {
  it("브라우저가 보낸 Host 기준 same-origin 요청을 허용한다", async () => {
    const response = await POST(request({
      "Content-Type": "application/json",
      Host: "127.0.0.1:3100",
      Origin: "http://127.0.0.1:3100",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it("교차 origin과 JSON이 아닌 제출을 repository 전에 거절한다", async () => {
    const crossOrigin = await POST(request({
      "Content-Type": "application/json",
      Host: "marketvalley.example",
      Origin: "https://attacker.example",
      "X-Forwarded-Proto": "https",
    }));
    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toMatchObject({ error: { code: "invalid_origin" } });

    const wrongContentType = await POST(request({
      "Content-Type": "text/plain",
      Host: "localhost:3100",
      Origin: "http://localhost:3100",
    }));
    expect(wrongContentType.status).toBe(415);
    await expect(wrongContentType.json()).resolves.toMatchObject({
      error: { code: "unsupported_media_type" },
    });
  });
});
