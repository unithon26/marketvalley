import type { NextAction, SignalOptionId } from "@/lib/contracts/campaign";
import { aggregateSignals, type SignalSummary } from "@/lib/demo/campaignSignals";
import { demoCampaign, demoCampaignId, demoCampaignSlug } from "@/lib/demo/demoCampaign";

export { demoCampaign, demoCampaignId, demoCampaignSlug };
export type { NextAction };

/** The fixed input behind the presentation's "예시 불러오기" action. */
export const demoIdeaInput = {
  description: "마감 전 남은 메뉴를 이웃에게 알리고 싶은 동네 1인 카페를 위한 당일 메뉴 알림 도구",
  expectedCustomer: "마감 전 남은 메뉴가 생기는 동네 1인 카페 사장님",
  desiredSignal: "solution_interest" as const,
  tone: "warm" as const,
};

/**
 * Four local mock responses leave one response short of the configured sample.
 * The presentation can add one browser response and visibly complete the rule.
 */
export const seedSignals: readonly SignalOptionId[] = [
  "positive",
  "positive",
  "neutral",
  "negative",
];

export function evaluateDecision(optionIds: readonly SignalOptionId[]): SignalSummary {
  return aggregateSignals(optionIds, demoCampaign);
}
