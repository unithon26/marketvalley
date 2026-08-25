import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseServiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseServiceConfigError";
  }
}

export type SupabaseServiceConfig = {
  url: string;
  serverKey: string;
};

type Environment = Record<string, string | undefined>;

function readNonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseServiceUrl(value: string): string {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) throw new Error("invalid protocol");
    return url.origin;
  } catch {
    throw new SupabaseServiceConfigError("NEXT_PUBLIC_SUPABASE_URL이 올바른 HTTPS URL이 아닙니다.");
  }
}

export function getSupabaseServiceConfig(
  environment: Environment = process.env,
): SupabaseServiceConfig {
  const rawUrl = readNonEmpty(environment.NEXT_PUBLIC_SUPABASE_URL);
  const serverKey = readNonEmpty(environment.SUPABASE_SECRET_KEY)
    ?? readNonEmpty(environment.SUPABASE_SERVICE_ROLE_KEY);

  if (!rawUrl || !serverKey) {
    throw new SupabaseServiceConfigError(
      "Supabase URL과 SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY를 설정해야 합니다.",
    );
  }

  return { url: parseServiceUrl(rawUrl), serverKey };
}

let cachedClient: SupabaseClient | null = null;

/** RLS를 우회하므로 공개 조회·예약 저장·서버 전용 quota RPC에만 사용한다. */
export function createSupabaseServiceClient(
  environment: Environment = process.env,
): SupabaseClient {
  if (environment === process.env && cachedClient) return cachedClient;
  const { url, serverKey } = getSupabaseServiceConfig(environment);
  const client = createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  if (environment === process.env) cachedClient = client;
  return client;
}
