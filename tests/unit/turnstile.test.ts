import { describe, expect, it, vi } from "vitest";

import {
  resolveReservationProtectionConfig,
} from "@/lib/security/reservationProtection";
import {
  ReservationVerificationRejectedError,
  ReservationVerificationUnavailableError,
  verifyReservationTurnstile,
} from "@/lib/security/turnstile";

const environment = {
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key",
  TURNSTILE_SECRET_KEY: "secret-key",
};

describe("reservation protection config", () => {
  it("fixture에서는 외부 설정을 요구하지 않는다", () => {
    expect(resolveReservationProtectionConfig("fixture", {})).toEqual({ mode: "fixture" });
  });

  it("운영 origin, 키와 quota 기본값을 검증한다", () => {
    expect(resolveReservationProtectionConfig("supabase", environment)).toMatchObject({
      mode: "turnstile",
      origin: "https://marketvalley.example.com",
      hostname: "marketvalley.example.com",
      limits: { campaignMinute: 10, globalMinute: 120, campaignTotal: 1_000 },
    });
    expect(() => resolveReservationProtectionConfig("supabase", {
      ...environment,
      NEXT_PUBLIC_SITE_URL: "https://user:pass@marketvalley.example.com/path",
    })).toThrow();
    expect(() => resolveReservationProtectionConfig("supabase", {
      ...environment,
      RESERVATION_CAMPAIGN_TOTAL_LIMIT: "0",
    })).toThrow();
  });
});

describe("Turnstile Siteverify", () => {
  const config = resolveReservationProtectionConfig("supabase", environment);
  if (config.mode !== "turnstile") throw new Error("test setup failed");

  it("secret을 form body로만 보내고 exact action과 hostname을 확인한다", async () => {
    const fetchImplementation = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
      const body = init?.body as URLSearchParams;
      expect(body.get("secret")).toBe("secret-key");
      expect(body.get("response")).toBe("client-token");
      return Response.json({
        success: true,
        action: "reservation",
        hostname: "marketvalley.example.com",
      });
    });

    await expect(verifyReservationTurnstile("client-token", config, fetchImplementation))
      .resolves.toBeUndefined();
  });

  it.each([
    { success: false, action: "reservation", hostname: "marketvalley.example.com" },
    { success: true, action: "login", hostname: "marketvalley.example.com" },
    { success: true, action: "reservation", hostname: "attacker.example" },
  ])("검증 결과 불일치를 모두 fail-closed 처리한다", async (payload) => {
    await expect(verifyReservationTurnstile(
      "client-token",
      config,
      vi.fn(async () => Response.json(payload)),
    )).rejects.toBeInstanceOf(ReservationVerificationRejectedError);
  });

  it("Siteverify timeout도 저장 허용으로 바꾸지 않는다", async () => {
    const shortConfig = { ...config, verifyTimeoutMs: 10 };
    const never = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>(
      (_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
    ));
    await expect(verifyReservationTurnstile("client-token", shortConfig, never))
      .rejects.toBeInstanceOf(ReservationVerificationUnavailableError);
  });
});
