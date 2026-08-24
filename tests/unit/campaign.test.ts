import { describe, expect, it } from "vitest";

import { campaignSpecSchema } from "@/lib/contracts/campaign";
import { demoCampaign } from "@/lib/demo/demoCampaign";

describe("CampaignSpec contract", () => {
  it("accepts the complete deterministic demo fixture", () => {
    expect(campaignSpecSchema.parse(demoCampaign)).toEqual(demoCampaign);
  });

  it("rejects duplicated signal option ids", () => {
    const invalidSpec = structuredClone(demoCampaign);
    invalidSpec.validation.signal.options[2].id = "positive";

    expect(() => campaignSpecSchema.parse(invalidSpec)).toThrow("각각 하나씩");
  });

  it("rejects duplicated signal option labels", () => {
    const invalidSpec = structuredClone(demoCampaign);
    invalidSpec.validation.signal.options[1].label = invalidSpec.validation.signal.options[0].label;

    expect(() => campaignSpecSchema.parse(invalidSpec)).toThrow("신호 선택지 문구는 서로 달라야 합니다.");
  });

  it("rejects a hero value proposition longer than 40 characters", () => {
    const invalidSpec = structuredClone(demoCampaign);
    invalidSpec.messaging.valueProposition = "가".repeat(41);

    expect(() => campaignSpecSchema.parse(invalidSpec)).toThrow();
  });

  it("requires exactly three landing pain points", () => {
    const invalidSpec = structuredClone(demoCampaign);
    invalidSpec.landing.painPoints.pop();

    expect(() => campaignSpecSchema.parse(invalidSpec)).toThrow();
  });

  it("rejects duplicate renderer keys and channel copy", () => {
    const duplicateFaq = structuredClone(demoCampaign);
    duplicateFaq.landing.faq[1].question = duplicateFaq.landing.faq[0].question;
    const duplicateHook = structuredClone(demoCampaign);
    duplicateHook.messaging.hooks[1] = duplicateHook.messaging.hooks[0];

    expect(() => campaignSpecSchema.parse(duplicateFaq)).toThrow("FAQ 질문은 서로 달라야 합니다.");
    expect(() => campaignSpecSchema.parse(duplicateHook)).toThrow("후킹 문구 3개는 서로 달라야 합니다.");
  });
});
