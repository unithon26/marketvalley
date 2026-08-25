import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CampaignReport } from "@/components/campaign-report";
import { createMetaDraftFormData } from "@/lib/client/metaDraft";
import { demoCampaign } from "@/lib/demo/demo-campaign";

const props = {
  campaignId: "22222222-2222-4222-8222-222222222222",
  publicSlug: "owner-campaign",
  initialSpec: demoCampaign,
  initialSummary: { total: 0, recent: [] },
  initialNextAction: null,
};

describe("Meta draft client boundary", () => {
  it("sends exactly campaignId and five PNG blobs", () => {
    const png = `data:image/png;base64,${btoa("png")}`;
    const formData = createMetaDraftFormData(props.campaignId, Array(5).fill(png));

    expect(Array.from(formData.keys())).toEqual([
      "campaignId", "image0", "image1", "image2", "image3", "image4",
    ]);
    expect(formData.get("campaignId")).toBe(props.campaignId);
    for (let index = 0; index < 5; index += 1) {
      const file = formData.get(`image${index}`);
      expect(file).toBeInstanceOf(File);
      expect((file as File).type).toBe("image/png");
    }
  });

  it("shows the explicit no-spend PAUSED action only when the server enables it", () => {
    const enabled = renderToStaticMarkup(createElement(CampaignReport, {
      ...props,
      metaAdsEnabled: true,
    }));
    const disabled = renderToStaticMarkup(createElement(CampaignReport, {
      ...props,
      metaAdsEnabled: false,
    }));

    expect(enabled).toContain("Ads Manager PAUSED 초안 만들기");
    expect(enabled).toContain("Meta 계정에 PAUSED 초안 생성 · 실제 노출·광고비 지출 없음");
    expect(enabled).toContain("Meta 계정의 Ads Manager에 PAUSED 초안 생성");
    expect(enabled).not.toContain("외부 계정·광고비 사용 없음");
    expect(disabled).not.toContain("Ads Manager PAUSED 초안 만들기");
    expect(disabled).toContain("Meta 게시 준비 다운로드");
    expect(disabled).toContain("실제 게시 또는 집행 아님");
  });

  it("keeps Meta credentials and Graph host out of the client module graph", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const clientSources = await Promise.all([
      "components/campaign-report.tsx",
      "lib/client/metaDraft.ts",
      "lib/contracts/metaDraft.ts",
      "lib/contracts/carouselAssets.ts",
    ].map((path) => readFile(`${root}${path}`, "utf8")));
    const combined = clientSources.join("\n");

    expect(combined).not.toContain("META_ACCESS_TOKEN");
    expect(combined).not.toContain("META_APP_SECRET");
    expect(combined).not.toContain("META_AD_ACCOUNT_ID");
    expect(combined).not.toContain("graph.facebook.com");
  });

  it("derives UI enablement from a server-verified identity and operator allowlist", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const page = await readFile(`${root}app/campaigns/[id]/page.tsx`, "utf8");
    const route = await readFile(`${root}app/api/meta/drafts/route.ts`, "utf8");
    const client = await readFile(`${root}lib/client/metaDraft.ts`, "utf8");

    expect(page).toContain("metaLiveConfigured ? await requireVerifiedIdentity() : null");
    expect(page).toContain("isMetaDraftOperator(metaIdentity?.userId)");
    expect(route).toContain('"meta_operator_required"');
    expect(route.indexOf("isMetaDraftOperator(identity.userId"))
      .toBeLessThan(route.indexOf("dependencies.parseFormData(request)"));
    expect(client).toContain("cannot cryptographically prove");
    expect(route).toContain("renderer provenance is not provable");
  });
});
