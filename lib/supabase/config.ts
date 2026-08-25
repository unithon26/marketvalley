export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export type AuthCookieOptions = {
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
};

export const supabasePkceAuthOptions = {
  experimental: { appendPkceFlowIdToRedirects: true },
} as const;

type Environment = Record<string, string | undefined>;

function readNonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseSupabaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SupabaseConfigurationError("NEXT_PUBLIC_SUPABASE_URL이 올바른 URL이 아닙니다.");
  }

  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new SupabaseConfigurationError("Supabase URL은 HTTPS여야 합니다.");
  }

  return url.origin;
}

export function getOptionalSupabaseConfig(
  environment: Environment = process.env,
): SupabasePublicConfig | null {
  const rawUrl = readNonEmpty(environment.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    readNonEmpty(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    readNonEmpty(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!rawUrl && !publishableKey) return null;
  if (!rawUrl || !publishableKey) {
    throw new SupabaseConfigurationError(
      "Supabase URL과 publishable key를 모두 설정해야 합니다.",
    );
  }

  return { url: parseSupabaseUrl(rawUrl), publishableKey };
}

export function getSupabaseConfig(environment: Environment = process.env): SupabasePublicConfig {
  const config = getOptionalSupabaseConfig(environment);
  if (!config) {
    throw new SupabaseConfigurationError("Supabase Auth 환경변수가 설정되지 않았습니다.");
  }
  return config;
}

export function hasCompleteSupabaseConfig(environment: Environment = process.env): boolean {
  try {
    return getOptionalSupabaseConfig(environment) !== null;
  } catch {
    return false;
  }
}

// Next.js only bundles public environment variables when each property is
// referenced statically. Client-rendered headers must not pass `process.env`
// as an object because that object is empty in the browser runtime.
export function hasCompleteBundledSupabaseConfig(): boolean {
  return hasCompleteSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getAuthCookieOptions(
  environment: Environment = process.env,
): AuthCookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: environment.NODE_ENV === "production",
  };
}
