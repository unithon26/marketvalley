import { describe, expect, it } from "vitest";

import { campaignThemeStyle, contrastRatio, readableTextColor } from "@/lib/brand-theme";
import { classInquiryCampaign, demoCampaign } from "@/lib/demo/demo-campaign";

describe("campaign brand theme", () => {
  it("chooses readable text for light and dark brand backgrounds", () => {
    expect(readableTextColor("#FFFFFF")).toBe("#191F28");
    expect(readableTextColor("#000000")).toBe("#FFFFFF");
    expect(readableTextColor("#777777")).toBe("#000000");
    expect(readableTextColor(demoCampaign.brand.accentColor)).toBe("#191F28");
    for (const background of ["#000000", "#FFFFFF", "#777777", "#E5A94A", "#6EA6D9"]) {
      expect(contrastRatio(readableTextColor(background), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps each contract color and tone into renderer variables", () => {
    expect(campaignThemeStyle(classInquiryCampaign.brand)).toMatchObject({
      "--campaign-primary": "#263B5A",
      "--campaign-accent": "#6EA6D9",
      "--campaign-surface": "#F2F6FB",
    });
    const edgeTheme = campaignThemeStyle({
      tone: "trust",
      primaryColor: "#777777",
      accentColor: "#AAAAAA",
      visualDirection: "대비 경계값을 확인하는 테스트 테마",
    });
    expect(contrastRatio(edgeTheme["--campaign-primary-ink"], "#777777")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(edgeTheme["--campaign-accent-text-on-surface"], "#F2F6FB")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every generated text variable readable for edge contract colors", () => {
    const backgrounds = ["#000000", "#FFFFFF", "#777777", "#AAAAAA"];
    for (const primaryColor of backgrounds) {
      for (const accentColor of backgrounds) {
        const theme = campaignThemeStyle({
          tone: "trust",
          primaryColor,
          accentColor,
          visualDirection: "계약 경계 색상 대비 테스트",
        });
        expect(contrastRatio(theme["--campaign-primary-ink"], primaryColor)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme["--campaign-accent-ink"], accentColor)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme["--campaign-surface-ink"], "#F2F6FB")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme["--campaign-accent-text-on-surface"], "#F2F6FB")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme["--campaign-white-ink"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme["--campaign-accent-text-on-white"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
