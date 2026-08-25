import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CampaignReport } from "@/components/campaign-report";

const root = fileURLToPath(new URL("../../", import.meta.url));
const props = {
  campaignId: "22222222-2222-4222-8222-222222222222",
  publicSlug: "owner-campaign",
  initialSummary: { total: 0, recent: [] },
};

describe("automatic Meta boundary", () => {
  it("리포트에서 수동 Meta 제어를 제거하고 서버 렌더 이미지만 사용한다", () => {
    const report = renderToStaticMarkup(createElement(CampaignReport, props));
    expect(report).not.toContain("Ads Manager PAUSED 초안 만들기");
    expect(report).not.toContain("실제 광고 활성화");
    expect(report).not.toContain("광고 즉시 중지");
    expect(report).toContain(`/api/campaigns/${props.campaignId}/cards/1`);
  });

  it("퇴역한 수동 API와 브라우저 이미지 업로드 client를 제공하지 않는다", async () => {
    for (const relative of [
      "app/api/meta/drafts/route.ts",
      "app/api/meta/runs/route.ts",
      "lib/client/metaDraft.ts",
      "lib/contracts/metaDraft.ts",
    ]) {
      await expect(access(`${root}${relative}`)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("자동 lifecycle이 허용 계정과 서버 렌더 경계를 통과한다", async () => {
    const lifecycle = await readFile(`${root}lib/lifecycle/campaignLifecycleProcessor.ts`, "utf8");
    expect(lifecycle).toContain("isMetaDraftOperator(campaign.ownerId");
    expect(lifecycle).toContain("renderCampaignCarouselPngAssets");
    expect(lifecycle).toContain("assertMetaAutomaticActivationAuthorized");
  });

  it("발표용 결과는 별도 모드로 명시되고 운영 제어 기능을 만들지 않는다", () => {
    const report = renderToStaticMarkup(createElement(CampaignReport, {
      ...props,
      presentationMode: { collectedHours: 24 },
    }));
    expect(report).toContain("24시간 수집 구간 스킵");
    expect(report).toContain("발표용 수집 완료 예시");
    expect(report).not.toContain("실제 광고 활성화");
  });
});
