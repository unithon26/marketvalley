const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 3;

type RateLimitEntry = {
  windowStartedAt: number;
  requests: number;
};

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

const globalForGenerationRateLimit = globalThis as typeof globalThis & {
  marketvalleyGenerationRateLimiterV1?: InMemoryGenerationRateLimiter;
};

export const generationRateLimiter = globalForGenerationRateLimit.marketvalleyGenerationRateLimiterV1
  ?? new InMemoryGenerationRateLimiter();

globalForGenerationRateLimit.marketvalleyGenerationRateLimiterV1 = generationRateLimiter;
