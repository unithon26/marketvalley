import type { CampaignRepository } from "@/lib/contracts/repository";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { requireVerifiedIdentity } from "@/lib/auth/authorization";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { resolveReservationProtectionConfig } from "@/lib/security/reservationProtection";

/**
 * fixture 모드는 자동 테스트에서만 명시적으로 사용한다. 제품 환경의 기본값은
 * 계정별 RLS와 영속 저장을 제공하는 Supabase이며 설정 누락 시 fail-closed 한다.
 */
const fixtureGlobal = globalThis as typeof globalThis & {
  __marketvalleyFixtureCampaignRepositoryV5?: FixtureCampaignRepository;
};

export const fixtureCampaignRepository =
  fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV5
  ?? new FixtureCampaignRepository();

fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV5 = fixtureCampaignRepository;

export type CampaignRepositoryScope = "owner" | "public";

type Environment = Record<string, string | undefined>;

export async function getCampaignRepository(
  scope: CampaignRepositoryScope,
  environment: Environment = process.env,
): Promise<CampaignRepository> {
  const mode = resolveCampaignRepositoryMode(environment);
  if (mode === "fixture") {
    return fixtureCampaignRepository;
  }

  const protection = resolveReservationProtectionConfig(mode, environment);

  const ownerClient = scope === "owner" ? await createSupabaseServerClient() : undefined;
  if (ownerClient) await requireVerifiedIdentity(ownerClient);

  return new SupabaseCampaignRepository({
    ownerClient,
    serviceClient: createSupabaseServiceClient(environment),
    hashSecret: environment.SIGNAL_HASH_SECRET!,
    reservationLimits: protection.mode === "turnstile" ? protection.limits : undefined,
  });
}
