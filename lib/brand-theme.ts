import type { CSSProperties } from "react";

import type { CampaignSpec } from "@/lib/contracts/campaign";

type CampaignThemeStyle = CSSProperties & Record<`--campaign-${string}`, string>;

const toneSurfaces: Record<CampaignSpec["brand"]["tone"], string> = {
  bold: "#F4F1FF",
  trust: "#F2F6FB",
  warm: "#F6F1E6",
};

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channelToLinear(red)
    + 0.7152 * channelToLinear(green)
    + 0.0722 * channelToLinear(blue);
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export function readableTextColor(background: string): "#FFFFFF" | "#191F28" | "#000000" {
  const candidates = ["#FFFFFF", "#191F28"] as const;
  const preferred = candidates.reduce((best, candidate) => (
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best
  ));
  return contrastRatio(preferred, background) >= 4.5 ? preferred : "#000000";
}

function accessibleBrandTextColor(
  preferred: string,
  background: string,
  alternate?: string,
): string {
  if (contrastRatio(preferred, background) >= 4.5) return preferred;
  if (alternate && contrastRatio(alternate, background) >= 4.5) return alternate;
  return readableTextColor(background);
}

export function campaignThemeStyle(brand: CampaignSpec["brand"]): CampaignThemeStyle {
  const surface = toneSurfaces[brand.tone];
  return {
    "--campaign-primary": brand.primaryColor,
    "--campaign-primary-ink": readableTextColor(brand.primaryColor),
    "--campaign-accent": brand.accentColor,
    "--campaign-accent-ink": readableTextColor(brand.accentColor),
    "--campaign-surface": surface,
    "--campaign-surface-ink": accessibleBrandTextColor(brand.primaryColor, surface),
    "--campaign-accent-text-on-surface": accessibleBrandTextColor(
      brand.accentColor,
      surface,
      brand.primaryColor,
    ),
    "--campaign-white-ink": accessibleBrandTextColor(brand.primaryColor, "#FFFFFF"),
    "--campaign-accent-text-on-white": accessibleBrandTextColor(
      brand.accentColor,
      "#FFFFFF",
      brand.primaryColor,
    ),
  };
}
