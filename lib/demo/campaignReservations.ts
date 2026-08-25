import {
  nextActionSchema,
  type NextAction,
} from "@/lib/contracts/campaign";
import type { ReservationRecord, ReservationSummary } from "@/lib/contracts/repository";

export function summarizeReservations(records: readonly ReservationRecord[]): ReservationSummary {
  return {
    total: records.length,
    recent: [...records].sort((a, b) => b.reservedAt.localeCompare(a.reservedAt)),
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
