import type { CampaignRepository } from "@/lib/contracts/repository";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { requireVerifiedIdentity } from "@/lib/auth/authorization";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

/**
 * fixture 모드는 서버 프로세스 메모리만 사용한다. 서버 재시작이나 serverless 인스턴스 전환
 * 뒤에는 초기 상태로 돌아가며, 실제 다중 기기 저장은 다음 Supabase adapter가 담당한다.
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
  if (resolveCampaignRepositoryMode(environment) === "fixture") {
    return fixtureCampaignRepository;
  }

  const ownerClient = scope === "owner" ? await createSupabaseServerClient() : undefined;
  if (ownerClient) await requireVerifiedIdentity(ownerClient);

  return new SupabaseCampaignRepository({
    ownerClient,
    serviceClient: createSupabaseServiceClient(environment),
    hashSecret: environment.SIGNAL_HASH_SECRET!,
  });
}
