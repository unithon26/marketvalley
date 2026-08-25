import { describe, expect, it } from "vitest";

import {
  createWizardHistoryState,
  resolveWizardStep,
} from "@/components/campaign-wizard";

describe("campaign wizard history", () => {
  it("Next.js history state를 보존하며 2단계 표식을 추가한다", () => {
    expect(createWizardHistoryState({ __NA: true, tree: "route-state" }, 2)).toEqual({
      __NA: true,
      tree: "route-state",
      marketvalleyWizardStep: 2,
    });
  });

  it("2단계 history에서만 솔루션 입력 단계로 복원한다", () => {
    expect(resolveWizardStep({ marketvalleyWizardStep: 2 })).toBe(2);
    expect(resolveWizardStep({ marketvalleyWizardStep: "2" })).toBe(1);
    expect(resolveWizardStep(null)).toBe(1);
  });
});
