import "server-only";

import {
  type MetaConfiguredBinding,
  MetaConfigurationError,
  validateConfiguredBinding,
} from "@/lib/meta/contracts";
import { GraphMetaAdsProvider } from "@/lib/meta/graphMetaAdsProvider";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";

type Environment = Record<string, string | undefined>;
export type MetaAdsMode = "disabled" | "live";
export type MetaPageInstagramBindingAttestation = {
  pageId: string;
  instagramActorId: string;
  verifiedAt: string;
};
export type MetaPausedDraftServerPolicy = {
  targeting: { countries: readonly ["KR"]; ageMin: 18; ageMax: 65 };
  lifetimeBudgetMinor: number;
  startsAt: string;
  endsAt: string;
};
const operatorUserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new MetaConfigurationError(`${name} 환경변수가 필요합니다.`);
  return value;
}

function integerInRange(
  environment: Environment,
  name: string,
  minimum: number,
  maximum: number,
  fallback?: number,
): number {
  const rawValue = environment[name]?.trim() || (fallback === undefined ? "" : String(fallback));
  if (!/^\d+$/u.test(rawValue)) {
    throw new MetaConfigurationError(`${name} 형식이 올바르지 않습니다.`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MetaConfigurationError(`${name}이 서버 안전 범위를 벗어났습니다.`);
  }
  return value;
}

export function readMetaAdsMode(environment: Environment = process.env): MetaAdsMode {
  const mode = environment.META_ADS_MODE?.trim() || "disabled";
  if (mode !== "disabled" && mode !== "live") {
    throw new MetaConfigurationError("META_ADS_MODE는 disabled 또는 live여야 합니다.");
  }
  return mode;
}

/** Internal company operators allowed to write PAUSED objects to the shared Meta account. */
export function readMetaDraftOperatorUserIds(
  environment: Environment = process.env,
): readonly string[] {
  const rawValues = required(environment, "META_DRAFT_OPERATOR_USER_IDS")
    .split(",")
    .map((value) => value.trim());
  if (
    rawValues.length > 20 ||
    rawValues.some((value) => !operatorUserIdPattern.test(value))
  ) {
    throw new MetaConfigurationError(
      "META_DRAFT_OPERATOR_USER_IDS는 중복 없는 내부 운영자 UUID 1~20개여야 합니다.",
    );
  }
  const values = rawValues.map((value) => value.toLowerCase());
  if (new Set(values).size !== values.length) {
    throw new MetaConfigurationError(
      "META_DRAFT_OPERATOR_USER_IDS는 중복 없는 내부 운영자 UUID 1~20개여야 합니다.",
    );
  }
  return values;
}

export function isMetaDraftOperator(
  userId: unknown,
  environment: Environment = process.env,
): boolean {
  if (typeof userId !== "string" || !operatorUserIdPattern.test(userId)) return false;
  try {
    return readMetaDraftOperatorUserIds(environment).includes(userId.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The value records a one-time operator Page→Instagram check performed with a User token.
 * Store only this exact pair and timestamp; the temporary User token must not be retained.
 * No expiry is inferred here because the product has not defined a defensible freshness policy.
 */
export function readMetaPageInstagramBindingAttestation(
  environment: Environment = process.env,
): MetaPageInstagramBindingAttestation {
  const pageId = required(environment, "META_PAGE_ID");
  const instagramActorId = required(environment, "META_INSTAGRAM_ACTOR_ID");
  const expectedPair = `${pageId}:${instagramActorId}`;
  if (required(environment, "META_VERIFIED_PAGE_INSTAGRAM_BINDING") !== expectedPair) {
    throw new MetaConfigurationError(
      "META_VERIFIED_PAGE_INSTAGRAM_BINDING이 설정된 Page–Instagram 쌍과 일치하지 않습니다.",
    );
  }
  const verifiedAt = required(environment, "META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(verifiedAt) ||
    !Number.isFinite(Date.parse(verifiedAt)) ||
    new Date(verifiedAt).toISOString() !== verifiedAt
  ) {
    throw new MetaConfigurationError(
      "META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT은 유효한 UTC ISO timestamp여야 합니다.",
    );
  }
  return { pageId, instagramActorId, verifiedAt };
}

export function assertMetaAdsLiveEnvironment(environment: Environment = process.env): void {
  if (readMetaAdsMode(environment) !== "live") {
    throw new MetaConfigurationError("Meta 광고 초안 live 모드가 비활성화되어 있습니다.");
  }
  if (
    environment.NODE_ENV !== "production" ||
    environment.CAMPAIGN_REPOSITORY_MODE !== "supabase" ||
    environment.META_OPERATION_LEDGER_MODE !== "supabase"
  ) {
    throw new MetaConfigurationError(
      "Meta live 모드는 production의 Supabase campaign repository와 durable ledger에서만 사용할 수 있습니다.",
    );
  }
  try {
    if (resolveCampaignRepositoryMode(environment) !== "supabase") throw new Error("not supabase");
  } catch {
    throw new MetaConfigurationError(
      "Meta live 모드에는 완전히 설정된 Supabase campaign repository가 필요합니다.",
    );
  }
  readMetaDraftOperatorUserIds(environment);
  readMetaPageInstagramBindingAttestation(environment);
}

export function readMetaConfiguredBinding(
  environment: Environment = process.env,
): MetaConfiguredBinding {
  const rawMaxBudget = required(environment, "META_MAX_LIFETIME_BUDGET_MINOR");
  if (!/^\d+$/u.test(rawMaxBudget)) {
    throw new MetaConfigurationError("META_MAX_LIFETIME_BUDGET_MINOR 형식이 올바르지 않습니다.");
  }
  return validateConfiguredBinding({
    adAccountId: required(environment, "META_AD_ACCOUNT_ID"),
    pageId: required(environment, "META_PAGE_ID"),
    instagramActorId: required(environment, "META_INSTAGRAM_ACTOR_ID"),
    allowedDestinationOrigins: [required(environment, "META_ALLOWED_DESTINATION_ORIGIN")],
    maxLifetimeBudgetMinor: Number(rawMaxBudget),
  });
}

export function readMetaPausedDraftServerPolicy(
  environment: Environment = process.env,
  now: Date = new Date(),
): MetaPausedDraftServerPolicy {
  const binding = readMetaConfiguredBinding(environment);
  const lifetimeBudgetMinor = integerInRange(
    environment,
    "META_DRAFT_LIFETIME_BUDGET_MINOR",
    100,
    binding.maxLifetimeBudgetMinor,
  );
  const leadMinutes = integerInRange(
    environment,
    "META_DRAFT_LEAD_MINUTES",
    5,
    24 * 60,
    10,
  );
  const durationHours = integerInRange(
    environment,
    "META_DRAFT_DURATION_HOURS",
    1,
    72,
    24,
  );
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) {
    throw new MetaConfigurationError("Meta PAUSED 초안 기준 시각이 올바르지 않습니다.");
  }
  // Round up to a whole minute so Graph receives a canonical, operator-readable window.
  // The relative window is intentionally calculated per request: a long-lived deployment
  // must not become unavailable because a fixed timestamp in its environment expired.
  const startTime = Math.ceil((nowTime + leadMinutes * 60 * 1_000) / 60_000) * 60_000;
  const endTime = startTime + durationHours * 60 * 60 * 1_000;
  return {
    targeting: { countries: ["KR"], ageMin: 18, ageMax: 65 },
    lifetimeBudgetMinor,
    startsAt: new Date(startTime).toISOString(),
    endsAt: new Date(endTime).toISOString(),
  };
}

export function isMetaPausedDraftLiveConfigured(
  environment: Environment = process.env,
  now: Date = new Date(),
): boolean {
  try {
    assertMetaAdsLiveEnvironment(environment);
    readMetaPausedDraftServerPolicy(environment, now);
    createGraphMetaAdsProviderFromEnvironment(environment);
    return true;
  } catch {
    return false;
  }
}

/**
 * Automatic activation is fail-closed behind an exact account and budget
 * acknowledgement. The owner must also be in the existing internal operator
 * allowlist so a newly registered account cannot spend from the shared ad account.
 */
export function assertMetaAutomaticActivationAuthorized(
  ownerId: string,
  environment: Environment = process.env,
): void {
  assertMetaAdsLiveEnvironment(environment);
  if (!isMetaDraftOperator(ownerId, environment)) {
    throw new MetaConfigurationError("자동 Meta 게시가 허용된 계정이 아닙니다.");
  }
  if (environment.META_AUTO_ACTIVATION_ENABLED?.trim() !== "true") {
    throw new MetaConfigurationError("Meta 자동 활성화가 잠겨 있습니다.");
  }
  const binding = readMetaConfiguredBinding(environment);
  const policy = readMetaPausedDraftServerPolicy(environment);
  if (
    required(environment, "META_AUTO_ACTIVATION_AD_ACCOUNT_ID") !== binding.adAccountId
    || integerInRange(
      environment,
      "META_AUTO_ACTIVATION_LIFETIME_BUDGET_MINOR",
      100,
      binding.maxLifetimeBudgetMinor,
    ) !== policy.lifetimeBudgetMinor
  ) {
    throw new MetaConfigurationError("Meta 자동 활성화 계정 또는 예산 확인값이 일치하지 않습니다.");
  }
}

export function isMetaAutomaticActivationConfigured(
  ownerId: string,
  environment: Environment = process.env,
): boolean {
  try {
    assertMetaAutomaticActivationAuthorized(ownerId, environment);
    return true;
  } catch {
    return false;
  }
}

export function createGraphMetaAdsProviderFromEnvironment(
  environment: Environment = process.env,
): GraphMetaAdsProvider {
  assertMetaAdsLiveEnvironment(environment);
  return new GraphMetaAdsProvider({
    binding: readMetaConfiguredBinding(environment),
    accessToken: required(environment, "META_ACCESS_TOKEN"),
    appSecret: required(environment, "META_APP_SECRET"),
    verifiedPageInstagramBinding: readMetaPageInstagramBindingAttestation(environment),
  });
}
