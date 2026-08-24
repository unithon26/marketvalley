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
});
