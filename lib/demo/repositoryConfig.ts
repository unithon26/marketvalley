import {
  getSupabaseServiceConfig,
  SupabaseServiceConfigError,
} from "@/lib/supabase/serviceClient";
import {
  getSupabaseConfig,
  SupabaseConfigurationError,
} from "@/lib/supabase/config";
import {
  ReservationProtectionConfigError,
  resolveReservationProtectionConfig,
} from "@/lib/security/reservationProtection";

export type CampaignRepositoryMode = "fixture" | "supabase";

type Environment = Record<string, string | undefined>;

export class CampaignRepositoryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignRepositoryConfigError";
  }
}

function readNonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveCampaignRepositoryMode(
  environment: Environment = process.env,
): CampaignRepositoryMode {
  const mode = readNonEmpty(environment.CAMPAIGN_REPOSITORY_MODE) ?? "fixture";
  if (mode === "fixture") return mode;
  if (mode !== "supabase") {
    throw new CampaignRepositoryConfigError(
      "CAMPAIGN_REPOSITORY_MODE는 fixture 또는 supabase여야 합니다.",
    );
  }

  try {
    getSupabaseConfig(environment);
    getSupabaseServiceConfig(environment);
    resolveReservationProtectionConfig("supabase", environment);
  } catch (error) {
    if (
      error instanceof SupabaseConfigurationError
      || error instanceof SupabaseServiceConfigError
      || error instanceof ReservationProtectionConfigError
    ) {
      throw new CampaignRepositoryConfigError(error.message);
    }
    throw error;
  }

  const hashSecret = readNonEmpty(environment.SIGNAL_HASH_SECRET);
  if (!hashSecret || Buffer.byteLength(hashSecret, "utf8") < 32) {
    throw new CampaignRepositoryConfigError(
      "supabase 모드에는 32바이트 이상의 서버 전용 SIGNAL_HASH_SECRET이 필요합니다.",
    );
  }

  return mode;
}
