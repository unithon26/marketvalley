import {
  nextActionSchema,
  signalOptionIdSchema,
  type CampaignSpec,
  type NextAction,
  type SignalOptionId,
} from "@/lib/contracts/campaign";
import type {
  SignalCounts,
  SignalDecisionStatus,
  SignalSummary,
} from "@/lib/contracts/repository";

export type { SignalCounts, SignalDecisionStatus, SignalSummary };

export const emptySignalCounts = (): SignalCounts => ({ positive: 0, neutral: 0, negative: 0 });

export function aggregateSignals(
  optionIds: readonly SignalOptionId[],
  spec: Pick<CampaignSpec, "validation">,
): SignalSummary {
  const counts = emptySignalCounts();

  for (const optionId of optionIds) {
    counts[signalOptionIdSchema.parse(optionId)] += 1;
  }

  const total = counts.positive + counts.neutral + counts.negative;
  const rule = spec.validation.decisionRule;
  const isRuleMet = total >= rule.minimumResponses && counts.positive >= rule.minimumPositiveResponses;
  const decisionStatus: SignalDecisionStatus = total === 0
    ? "no_responses"
    : total < rule.minimumResponses
      ? "insufficient_sample"
      : isRuleMet
        ? "threshold_met"
        : "threshold_not_met";

  return {
    ...counts,
    total,
    positiveRate: total === 0 ? null : counts.positive / total,
    decisionStatus,
    isRuleMet,
    remainingResponses: Math.max(0, rule.minimumResponses - total),
    remainingPositiveResponses: Math.max(0, rule.minimumPositiveResponses - counts.positive),
  };
}

export const nextActionCopy: Record<NextAction, { label: string; description: string }> = {
  continue: { label: "계속 검증", description: "현재 가설로 더 많은 반응을 확인합니다." },
  revise: { label: "메시지 수정", description: "입력으로 돌아가 새 광고를 만듭니다." },
  pause: { label: "보류", description: "현재 광고를 멈추고 판단을 보류합니다." },
};

export type NextActionState = {
  selectedAction: NextAction | null;
  options: Array<{ action: NextAction; label: string; description: string; selected: boolean }>;
};

export function createNextActionState(action: NextAction | null | undefined): NextActionState {
  const selectedAction = action == null ? null : nextActionSchema.parse(action);

  return {
    selectedAction,
    options: (Object.keys(nextActionCopy) as NextAction[]).map((nextAction) => ({
      action: nextAction,
      ...nextActionCopy[nextAction],
      selected: nextAction === selectedAction,
    })),
  };
}
