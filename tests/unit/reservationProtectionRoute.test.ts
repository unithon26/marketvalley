import { describe, expect, it, vi } from "vitest";

import { createReservationPostHandler } from "@/app/api/reservations/route";
import {
  CampaignNotFoundError,
  ReservationRateLimitError,
  ReservationStoreUnavailableError,
} from "@/lib/contracts/repository";
import {
  ReservationVerificationRejectedError,
  ReservationVerificationUnavailableError,
} from "@/lib/security/turnstile";

const environment = {
  CAMPAIGN_REPOSITORY_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SIGNAL_HASH_SECRET: "0123456789abcdef0123456789abcdef", // gitleaks:allow -- deterministic test fixture
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key",
  TURNSTILE_SECRET_KEY: "secret-key",
};

function request(options: { origin?: string; token?: string } = {}): Request {
  return new Request("http://app:3000/api/reservations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? "https://marketvalley.example.com",
    },
    body: JSON.stringify({
      campaignId: "11111111-1111-4111-8111-111111111111",
      name: "예약자",
      email: "person@example.com",
      consent: true,
      ...(options.token === undefined ? {} : { turnstileToken: options.token }),
    }),
  });
}

function handlerWithRecord(recordReservation: () => Promise<void>) {
  const verifyTurnstile = vi.fn(async () => undefined);
  const repository = vi.fn(async () => ({ recordReservation } as never));
  return {
    handler: createReservationPostHandler({ environment, verifyTurnstile, repository }),
    verifyTurnstile,
    repository,
  };
}

describe("protected reservation route", () => {
  it("canonical origin과 Turnstile 검증 뒤에만 저장한다", async () => {
    const recordReservation = vi.fn(async () => undefined);
    const { handler, verifyTurnstile } = handlerWithRecord(recordReservation);
    const response = await handler(request({ token: "verified-token" }));

    expect(response.status).toBe(201);
    expect(verifyTurnstile).toHaveBeenCalledWith(
      "verified-token",
      expect.objectContaining({ hostname: "marketvalley.example.com" }),
    );
    expect(recordReservation).toHaveBeenCalledOnce();
  });

  it("Origin 누락·불일치와 token 누락을 repository 전에 막는다", async () => {
    const recordReservation = vi.fn(async () => undefined);
    const { handler, verifyTurnstile, repository } = handlerWithRecord(recordReservation);

    const crossOrigin = await handler(request({ origin: "https://attacker.example", token: "x" }));
    expect(crossOrigin.status).toBe(403);
    const missingToken = await handler(request());
    expect(missingToken.status).toBe(400);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("Supabase가 해석할 수 없는 campaign ID를 CAPTCHA 호출 전에 거절한다", async () => {
    const verifyTurnstile = vi.fn(async () => undefined);
    const repository = vi.fn();
    const handler = createReservationPostHandler({ environment, verifyTurnstile, repository });
    const invalid = new Request("http://app:3000/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://marketvalley.example.com",
      },
      body: JSON.stringify({
        campaignId: "fixture-only-id",
        name: "예약자",
        email: "person@example.com",
        consent: true,
        turnstileToken: "unused-token",
      }),
    });

    expect((await handler(invalid)).status).toBe(400);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("CAPTCHA와 DB 장애를 503으로 fail-closed 처리한다", async () => {
    const repository = vi.fn(async () => ({
      recordReservation: vi.fn(async () => { throw new ReservationStoreUnavailableError(); }),
    } as never));
    const captchaFailure = createReservationPostHandler({
      environment,
      repository,
      verifyTurnstile: vi.fn(async () => { throw new ReservationVerificationUnavailableError(); }),
    });
    expect((await captchaFailure(request({ token: "bad" }))).status).toBe(503);

    const { handler } = handlerWithRecord(async () => { throw new ReservationStoreUnavailableError(); });
    expect((await handler(request({ token: "good" }))).status).toBe(503);
  });

  it("유효하지 않거나 만료된 CAPTCHA는 재확인이 가능한 403으로 응답한다", async () => {
    const handler = createReservationPostHandler({
      environment,
      repository: vi.fn(),
      verifyTurnstile: vi.fn(async () => { throw new ReservationVerificationRejectedError(); }),
    });

    const response = await handler(request({ token: "expired" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "reservation_verification_failed" },
    });
  });

  it("원자 RPC의 quota·capacity와 not-found 결과를 HTTP 계약으로 변환한다", async () => {
    for (const [reason, retryAfter] of [["rate_limited", "60"], ["capacity", "86400"]] as const) {
      const { handler } = handlerWithRecord(async () => {
        throw new ReservationRateLimitError(Number(retryAfter), reason);
      });
      const response = await handler(request({ token: "good" }));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
    }

    const { handler } = handlerWithRecord(async () => { throw new CampaignNotFoundError(); });
    expect((await handler(request({ token: "good" }))).status).toBe(404);
  });
});
