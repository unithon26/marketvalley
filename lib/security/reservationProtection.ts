export type ReservationProtectionLimits = {
  campaignMinute: number;
  globalMinute: number;
  campaignTotal: number;
};

export type ReservationProtectionConfig =
  | { mode: "fixture" }
  | {
      mode: "turnstile";
      origin: string;
      hostname: string;
      siteKey: string;
      secretKey: string;
      verifyTimeoutMs: number;
      limits: ReservationProtectionLimits;
    };

type Environment = Record<string, string | undefined>;

export class ReservationProtectionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationProtectionConfigError";
  }
}
function readRequired(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ReservationProtectionConfigError(`${name}이 필요합니다.`);
  return value;
}

function readInteger(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ReservationProtectionConfigError(
      `${name}은 ${minimum} 이상 ${maximum} 이하의 정수여야 합니다.`,
    );
  }
  return parsed;
}

function parseCanonicalOrigin(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReservationProtectionConfigError("NEXT_PUBLIC_SITE_URL이 올바른 URL이 아닙니다.");
  }
  if (
    url.protocol !== "https:"
    || url.pathname !== "/"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new ReservationProtectionConfigError(
      "Supabase 운영 예약에는 origin 형태의 HTTPS NEXT_PUBLIC_SITE_URL이 필요합니다.",
    );
  }
  return url;
}

export function resolveReservationProtectionConfig(
  repositoryMode: "fixture" | "supabase",
  environment: Environment = process.env,
): ReservationProtectionConfig {
  if (repositoryMode === "fixture") return { mode: "fixture" };

  const canonicalUrl = parseCanonicalOrigin(readRequired(environment, "NEXT_PUBLIC_SITE_URL"));
  const siteKey = readRequired(environment, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const secretKey = readRequired(environment, "TURNSTILE_SECRET_KEY");
  if (siteKey.length > 256 || secretKey.length > 256) {
    throw new ReservationProtectionConfigError("Turnstile 키 길이를 확인해주세요.");
  }

  const campaignMinute = readInteger(
    environment,
    "RESERVATION_CAMPAIGN_MINUTE_LIMIT",
    10,
    1,
    1_000,
  );
  const globalMinute = readInteger(
    environment,
    "RESERVATION_GLOBAL_MINUTE_LIMIT",
    120,
    1,
    100_000,
  );
  const campaignTotal = readInteger(
    environment,
    "RESERVATION_CAMPAIGN_TOTAL_LIMIT",
    1_000,
    1,
    1_000_000,
  );
  if (campaignMinute > globalMinute) {
    throw new ReservationProtectionConfigError(
      "RESERVATION_CAMPAIGN_MINUTE_LIMIT은 전체 분당 제한보다 클 수 없습니다.",
    );
  }

  return {
    mode: "turnstile",
    origin: canonicalUrl.origin,
    hostname: canonicalUrl.hostname,
    siteKey,
    secretKey,
    verifyTimeoutMs: readInteger(environment, "TURNSTILE_VERIFY_TIMEOUT_MS", 3_000, 500, 10_000),
    limits: { campaignMinute, globalMinute, campaignTotal },
  };
}
