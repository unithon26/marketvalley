import type { CampaignRepository } from "@/lib/contracts/repository";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";

/**
 * fixture 모드는 서버 프로세스 메모리만 사용한다. 서버 재시작이나 serverless 인스턴스 전환
 * 뒤에는 초기 상태로 돌아가며, 실제 다중 기기 저장은 다음 Supabase adapter가 담당한다.
 */
const fixtureGlobal = globalThis as typeof globalThis & {
  __marketvalleyFixtureCampaignRepositoryV3?: FixtureCampaignRepository;
};

export const fixtureCampaignRepository =
  fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV3
  ?? new FixtureCampaignRepository();

fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV3 = fixtureCampaignRepository;

export const campaignRepository: CampaignRepository = fixtureCampaignRepository;
