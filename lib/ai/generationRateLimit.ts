import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 3;
const DEFAULT_DAILY_USER_LIMIT = 30;
const DEFAULT_DAILY_GLOBAL_LIMIT = 300;

type Environment = Record<string, string | undefined>;

type RateLimitEntry = {
  windowStartedAt: number;
  requests: number;
};

export type GenerationQuotaConfig = {
  mode: "memory" | "supabase";
  maximumRequests: number;
  windowSeconds: number;
  dailyUserLimit: number;
  dailyGlobalLimit: number;
};

export class GenerationRateLimitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationRateLimitConfigError";
  }
}

export class GenerationRateLimitUnavailableError extends Error {
  constructor() {
    super("distributed generation rate limit is unavailable");
    this.name = "GenerationRateLimitUnavailableError";
  }
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  range: { minimum: number; maximum: number },
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < range.minimum || parsed > range.maximum) {
    throw new GenerationRateLimitConfigError(
      `${name}은 ${range.minimum} 이상 ${range.maximum} 이하의 정수여야 합니다.`,
    );
  }
  return parsed;
}

export function resolveGenerationQuotaConfig(
  environment: Environment = process.env,
): GenerationQuotaConfig {
  const repositoryMode = resolveCampaignRepositoryMode(environment);
  const generatorMode = environment.CAMPAIGN_GENERATOR_MODE?.trim() || "anthropic";
  const isProduction = environment.NODE_ENV === "production";

  if (isProduction && generatorMode !== "fixture" && repositoryMode !== "supabase") {
    throw new GenerationRateLimitConfigError(
      "production 유료 생성 모드에는 CAMPAIGN_REPOSITORY_MODE=supabase 분산 제한이 필요합니다.",
    );
  }

  const maximumRequests = positiveInteger(
    environment.AI_RATE_LIMIT_MAX_REQUESTS
      ?? environment.ANTHROPIC_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_MAX_REQUESTS,
    { minimum: 1, maximum: 20 },
    "AI_RATE_LIMIT_MAX_REQUESTS",
  );
  const windowSeconds = positiveInteger(
    environment.AI_RATE_LIMIT_WINDOW_SECONDS
      ?? environment.ANTHROPIC_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_MS / 1_000,
    { minimum: 10, maximum: 3_600 },
    "AI_RATE_LIMIT_WINDOW_SECONDS",
  );
  const dailyUserLimit = positiveInteger(
    environment.AI_DAILY_USER_LIMIT
      ?? environment.ANTHROPIC_DAILY_USER_LIMIT,
    DEFAULT_DAILY_USER_LIMIT,
    { minimum: 1, maximum: 1_000 },
    "AI_DAILY_USER_LIMIT",
  );
  const dailyGlobalLimit = positiveInteger(
    environment.AI_DAILY_GLOBAL_LIMIT
      ?? environment.ANTHROPIC_DAILY_GLOBAL_LIMIT,
    DEFAULT_DAILY_GLOBAL_LIMIT,
    { minimum: 1, maximum: 100_000 },
    "AI_DAILY_GLOBAL_LIMIT",
  );

  if (dailyUserLimit > dailyGlobalLimit) {
    throw new GenerationRateLimitConfigError(
      "AI_DAILY_USER_LIMIT은 AI_DAILY_GLOBAL_LIMIT보다 클 수 없습니다.",
    );
  }

  return {
    mode: repositoryMode === "supabase" ? "supabase" : "memory",
    maximumRequests,
    windowSeconds,
    dailyUserLimit,
    dailyGlobalLimit,
  };
}

export class InMemoryGenerationRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maximumRequests = DEFAULT_MAX_REQUESTS,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): boolean {
    const now = this.now();
    const current = this.entries.get(key);

    if (!current || now - current.windowStartedAt >= this.windowMs) {
      this.entries.set(key, { windowStartedAt: now, requests: 1 });
      return true;
    }

    if (current.requests >= this.maximumRequests) return false;
    current.requests += 1;
    return true;
  }
}

export class SupabaseGenerationRateLimiter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly config: GenerationQuotaConfig,
  ) {}

  async consume(userId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_generation_quota", {
      p_user_id: userId,
      p_max_requests: this.config.maximumRequests,
      p_window_seconds: this.config.windowSeconds,
      p_daily_user_limit: this.config.dailyUserLimit,
      p_daily_global_limit: this.config.dailyGlobalLimit,
    });
    if (error || typeof data !== "boolean") throw new GenerationRateLimitUnavailableError();
    return data;
  }
}

const globalForGenerationRateLimit = globalThis as typeof globalThis & {
  marketvalleyGenerationRateLimiterV1?: InMemoryGenerationRateLimiter;
};

export const generationRateLimiter = globalForGenerationRateLimit.marketvalleyGenerationRateLimiterV1
  ?? new InMemoryGenerationRateLimiter();

globalForGenerationRateLimit.marketvalleyGenerationRateLimiterV1 = generationRateLimiter;

export async function consumeGenerationQuota(
  userId: string,
  environment: Environment = process.env,
): Promise<boolean> {
  const config = resolveGenerationQuotaConfig(environment);
  if (config.mode === "memory") return generationRateLimiter.consume(userId);
  return new SupabaseGenerationRateLimiter(createSupabaseServiceClient(environment), config)
    .consume(userId);
}
