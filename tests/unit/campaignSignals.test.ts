import { describe, expect, it } from "vitest";

import { aggregateSignals, createNextActionState } from "@/lib/demo/campaignSignals";
import { evaluateDecision, seedSignals } from "@/lib/demo/demo-campaign";
import { demoCampaign } from "@/lib/demo/demoCampaign";

describe("aggregateSignals", () => {
  it("keeps the result as insufficient until the minimum sample is reached", () => {
    expect(aggregateSignals(["positive", "neutral"], demoCampaign)).toMatchObject({
      positive: 1,
      neutral: 1,
      negative: 0,
      total: 2,
      positiveRate: 0.5,
      decisionStatus: "insufficient_sample",
      isRuleMet: false,
      remainingResponses: 3,
      remainingPositiveResponses: 2,
    });
  });

  it("marks the rule met only when both response requirements are met", () => {
    expect(aggregateSignals(["positive", "positive", "positive", "neutral", "negative"], demoCampaign))
      .toMatchObject({ decisionStatus: "threshold_met", isRuleMet: true, remainingResponses: 0, remainingPositiveResponses: 0 });
  });

  it("does not claim a rate when there are no responses", () => {
    expect(aggregateSignals([], demoCampaign)).toMatchObject({
      total: 0,
      positiveRate: null,
      decisionStatus: "no_responses",
    });
  });
});

describe("createNextActionState", () => {
  it("marks only the human-selected next action", () => {
    const state = createNextActionState("continue");

    expect(state.selectedAction).toBe("continue");
    expect(state.options.filter((option) => option.selected)).toEqual([
      expect.objectContaining({ action: "continue", label: "계속 검증" }),
    ]);
  });
});

describe("presentation demo helpers", () => {
  it("starts one response short of the fixed decision-rule sample", () => {
    expect(evaluateDecision(seedSignals)).toMatchObject({
      total: 4,
      positive: 2,
      decisionStatus: "insufficient_sample",
      remainingResponses: 1,
    });
  });
});
