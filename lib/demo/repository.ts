import type { CampaignRepository } from "@/lib/contracts/repository";

/**
 * 개발자 B가 Task 3 마지막 단계에서 이 파일의 내용을 실제 구현(FixtureCampaignRepository)으로
 * 교체한다. export 이름(`campaignRepository`)과 타입(`CampaignRepository`)은 그대로 유지한다 —
 * 이 계약 덕분에 개발자 A는 B의 구현이 존재하지 않아도 이 파일을 import하는 코드를
 * 지금 바로 작성·타입체크·커밋할 수 있다.
 */
export const campaignRepository: CampaignRepository = {
  async publish(_draftId, spec) {
    return { id: "demo", slug: "demo", spec, publishedAt: new Date().toISOString(), nextAction: null };
  },
  async getBySlug() {
    return null;
  },
  async recordSignal() {
    throw new Error("campaignRepository stub: Task 3가 끝난 뒤에 사용할 수 있습니다.");
  },
  async getSignalSummary() {
    throw new Error("campaignRepository stub: Task 3가 끝난 뒤에 사용할 수 있습니다.");
  },
  async saveNextAction() {
    throw new Error("campaignRepository stub: Task 3가 끝난 뒤에 사용할 수 있습니다.");
  },
};
