import { describe, expect, it } from "vitest";

import { createNextActionState, summarizeReservations } from "@/lib/demo/campaignReservations";
import { evaluateDecision, seedReservations } from "@/lib/demo/demo-campaign";

describe("summarizeReservations", () => {
  it("counts total reservations and sorts recent first", () => {
    const summary = summarizeReservations([
      { id: "a", name: "가", email: "a@example.com", reservedAt: "2026-08-24T09:00:00.000Z" },
      { id: "b", name: "나", email: "b@example.com", reservedAt: "2026-08-24T09:10:00.000Z" },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.recent.map((record) => record.id)).toEqual(["b", "a"]);
  });

  it("reports zero reservations for an empty list", () => {
    expect(summarizeReservations([])).toEqual({ total: 0, recent: [] });
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
  it("summarizes the fixed seed reservations", () => {
    expect(evaluateDecision(seedReservations)).toMatchObject({ total: 4 });
  });
});
