import type { ReservationProtectionConfig } from "@/lib/security/reservationProtection";

const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileConfig = Extract<ReservationProtectionConfig, { mode: "turnstile" }>;

type SiteverifyResponse = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
};

export class ReservationVerificationUnavailableError extends Error {
  constructor() {
    super("reservation verification unavailable");
    this.name = "ReservationVerificationUnavailableError";
  }
}

export class ReservationVerificationRejectedError extends Error {
  constructor() {
    super("reservation verification rejected");
    this.name = "ReservationVerificationRejectedError";
  }
}

export async function verifyReservationTurnstile(
  token: string,
  config: TurnstileConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.verifyTimeoutMs);
  try {
    const response = await fetchImplementation(siteverifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: config.secretKey, response: token }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new ReservationVerificationUnavailableError();

    let result: SiteverifyResponse;
    try {
      result = await response.json() as SiteverifyResponse;
    } catch {
      throw new ReservationVerificationUnavailableError();
    }

    if (
      result.success !== true
      || result.action !== "reservation"
      || result.hostname !== config.hostname
    ) {
      throw new ReservationVerificationRejectedError();
    }
  } catch (error) {
    if (
      error instanceof ReservationVerificationUnavailableError
      || error instanceof ReservationVerificationRejectedError
    ) throw error;
    throw new ReservationVerificationUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
