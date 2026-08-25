import { readFile } from "node:fs/promises";

import { expect, test, type APIRequestContext, type APIResponse, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";

import { carouselFileNames } from "@/components/renderers/carousel-card";

function captureRuntimeErrors(page: Page, runtimeErrors: string[]) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
}

function responseMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "선택형 응답" }).locator("strong");
}

function positiveRateMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "긍정 신호율" }).locator("strong");
}

function remainingDecisionMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "기준 충족 최소 추가" }).locator("strong");
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function expectCarouselEntries(zip: JSZip): Promise<void> {
  for (const fileName of carouselFileNames) {
    const entry = zip.file(fileName);
    expect(entry, `${fileName} should exist`).not.toBeNull();
    const bytes = await entry!.async("uint8array");
    expect(pngDimensions(bytes)).toEqual({ width: 1080, height: 1350 });
  }
}

async function expectApiError(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
}

async function computedContrastRatio(
  page: Page,
  textSelector: string,
  backgroundSelector = textSelector,
): Promise<number> {
  return page.evaluate(({ textSelector, backgroundSelector }) => {
    const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (color: string) => channels(color)
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = getComputedStyle(document.querySelector<HTMLElement>(textSelector)!).color;
    const background = getComputedStyle(document.querySelector<HTMLElement>(backgroundSelector)!).backgroundColor;
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }, { textSelector, backgroundSelector });
}

async function publishFixtureCampaign(
  request: APIRequestContext,
  input: { background: string; solution: string },
) {
  const generateResponse = await request.post("/api/generate", { data: input });
  expect(generateResponse.ok()).toBe(true);
  const { spec } = await generateResponse.json();
  const publishResponse = await request.post("/api/campaigns", {
    data: { draftId: crypto.randomUUID(), spec },
  });
  expect(publishResponse.ok()).toBe(true);
  return publishResponse.json();
}

test.beforeEach(async ({ request }) => {
  const response = await request.delete("/api/campaigns");
  expect(response.ok()).toBe(true);
});

test("fixture 생성부터 산출물, 응답, 판단, 초기화까지 실제 API 경계로 이어진다", async ({ context, page, request }) => {
  const runtimeErrors: string[] = [];
  captureRuntimeErrors(page, runtimeErrors);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3100" });

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await page.getByRole("link", { name: "새 광고" }).click();
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /광고 만들기/ }).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+\/progress$/);
  const campaignId = decodeURIComponent(page.url().match(/\/campaigns\/([^/]+)\/progress$/)?.[1] ?? "");
  expect(campaignId).not.toBe("");
  const reportLink = page.getByRole("link", { name: /검증 리포트 확인하기/ });
  await expect(reportLink).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await reportLink.click();

  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));
  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await expect(responseMetric(page)).toHaveText("4건");
  await expect(page.getByText("긍정 2 / 전체 4", { exact: true })).toBeVisible();
  await expect(page.getByText("표본 수 부족", { exact: true })).toBeVisible();

  const campaignResponse = await request.get(`/api/campaigns?id=${campaignId}`);
  expect(campaignResponse.ok()).toBe(true);
  const campaign = await campaignResponse.json();
  expect(campaign.spec.project.name).toBe("마감한입");
  expect(campaign.spec.landing.benefits.map((benefit: { title: string }) => benefit.title)).toEqual([
    "남은 메뉴 한 번 입력",
    "공개 페이지와 게시 카드 동시 생성",
    "개인정보 없는 구매 의향 수집",
  ]);
  await expect(page.locator(".carousel-card-1")).toHaveAttribute(
    "data-carousel-cover-template",
    campaign.spec.templates.carouselCover,
  );
  await expect(page.locator(".carousel-card-1")).toHaveAttribute("data-product-name", "마감한입");
  await expect(page.locator(".carousel-card-3")).toContainText("공개 페이지와 게시 카드 동시 생성");
  const copyCases = [
    { cardLabel: "게시 문구", noticeLabel: "게시 문구", value: campaign.spec.messaging.caption },
    { cardLabel: "후킹 문구 3개", noticeLabel: "후킹 문구", value: campaign.spec.messaging.hooks.join("\n") },
    { cardLabel: "CTA", noticeLabel: "CTA", value: campaign.spec.validation.signal.ctaLabel },
    { cardLabel: "해시태그", noticeLabel: "해시태그", value: campaign.spec.messaging.hashtags.join(" ") },
  ];
  for (const copyCase of copyCases) {
    const copyCard = page.locator(".copy-grid > div").filter({ hasText: copyCase.cardLabel });
    await copyCard.getByRole("button", { name: "복사" }).click();
    await expect(page.getByRole("status")).toHaveText(`${copyCase.noticeLabel} 복사를 완료했어요.`);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(copyCase.value);
  }

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "캐러셀 ZIP 다운로드" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${campaignId}-carousel.zip`);
  const carouselZip = await JSZip.loadAsync(await downloadBytes(download));
  expect(Object.keys(carouselZip.files).sort()).toEqual([...carouselFileNames].sort());
  await expectCarouselEntries(carouselZip);

  const [metaDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Meta 게시 준비 다운로드" }).click(),
  ]);
  expect(metaDownload.suggestedFilename()).toBe(`${campaignId}-meta-ready.zip`);
  const metaZip = await JSZip.loadAsync(await downloadBytes(metaDownload));
  expect(Object.keys(metaZip.files).sort()).toEqual([...carouselFileNames, "meta-ready.txt"].sort());
  await expectCarouselEntries(metaZip);
  const metaText = await metaZip.file("meta-ready.txt")!.async("string");
  expect(metaText).toContain("[Meta 게시 준비 — 실제 게시 아님]");
  expect(metaText).toContain("상품명: 마감한입");
  expect(metaText).toContain("핵심 특징: 남은 메뉴 한 번 입력 · 공개 페이지와 게시 카드 동시 생성 · 개인정보 없는 구매 의향 수집");
  expect(metaText).toContain(`Destination URL: ${new URL(page.url()).origin}/p/${campaign.slug}`);
  expect(metaText).toContain(`Media files: ${carouselFileNames.join(", ")}`);
  expect(metaText).toContain(campaign.spec.brand.visualDirection);
  expect(metaText).toContain(`Carousel cover template: ${campaign.spec.templates.carouselCover}`);
  expect(metaText).toContain(`Landing intro template: ${campaign.spec.templates.landingIntro}`);

  const [landingPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "공개 랜딩 열기" }).first().click(),
  ]);
  captureRuntimeErrors(landingPage, runtimeErrors);
  await landingPage.waitForLoadState("domcontentloaded");
  await expect(landingPage.locator(".public-landing")).toHaveAttribute(
    "data-landing-template",
    campaign.spec.templates.landingIntro,
  );
  await expect(landingPage.locator(".public-landing")).toHaveAttribute("data-product-name", "마감한입");
  await expect(landingPage.getByText("#남은 메뉴 한 번 입력", { exact: true })).toBeVisible();
  await landingPage.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await landingPage.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();

  await page.bringToFront();
  await expect(responseMetric(page)).toHaveText("5건");
  await expect(page.getByText("긍정 3 / 전체 5", { exact: true })).toBeVisible();
  await expect(page.getByText("기준 도달", { exact: true })).toBeVisible();

  await landingPage.bringToFront();
  await landingPage.reload();
  await landingPage.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await landingPage.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "이미 참여했어요" })).toBeVisible();

  await page.bringToFront();
  await expect(responseMetric(page)).toHaveText("5건");
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await expect(page.getByRole("status")).toHaveText("다음 행동을 저장했어요.");
  await page.reload();
  await expect(page.locator(".decision-grid button.selected")).toContainText("계속 검증");

  await page.getByRole("button", { name: "데모 데이터 초기화" }).click();
  await expect(page.getByRole("status")).toHaveText("발표용 응답과 판단을 초기화했어요.");
  await expect(responseMetric(page)).toHaveText("4건");
  await expect(page.getByText("표본 수 부족", { exact: true })).toBeVisible();
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);
  await page.reload();
  await expect(responseMetric(page)).toHaveText("4건");
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);

  await landingPage.bringToFront();
  await landingPage.reload();
  await landingPage.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await landingPage.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();

  expect(runtimeErrors.filter((message) => !message.includes("status of 409 (Conflict)"))).toEqual([]);
  expect(runtimeErrors.filter((message) => message.includes("status of 409 (Conflict)"))).toHaveLength(1);
});

test("입력한 상품명과 특징이 랜딩과 카드뉴스에 자동으로 이어진다", async ({ page, request }) => {
  const background = "예약 취소가 생길 때마다 동네 공방 빈자리 안내를 여러 채널에 다시 만들어 올리는 일이 반복됩니다.";
  const solution = "서비스 이름은 ‘공방온’입니다. 핵심 특징은 빈자리 한 번 입력, 이웃 대상 공개 페이지, 개인정보 없는 참여 의향 수집입니다. 공방 운영자의 안내 광고를 자동으로 만듭니다.";

  await page.goto("/new");
  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+\/progress$/);

  const campaignId = decodeURIComponent(page.url().match(/\/campaigns\/([^/]+)\/progress$/)?.[1] ?? "");
  const reportLink = page.getByRole("link", { name: /검증 리포트 확인하기/ });
  await expect(reportLink).toBeVisible({ timeout: 5_000 });
  await reportLink.click();

  const campaignResponse = await request.get(`/api/campaigns?id=${campaignId}`);
  expect(campaignResponse.ok()).toBe(true);
  const campaign = await campaignResponse.json();
  expect(campaign.spec.project.name).toBe("공방온");
  expect(campaign.spec.landing.benefits.map((benefit: { title: string }) => benefit.title)).toEqual([
    "빈자리 한 번 입력",
    "이웃 대상 공개 페이지",
    "개인정보 없는 참여 의향 수집",
  ]);

  await expect(page.locator(".carousel-card-1")).toHaveAttribute("data-product-name", "공방온");
  await expect(page.locator(".carousel-card-3")).toContainText("이웃 대상 공개 페이지");
  await expect(page.locator(".carousel-card-4")).toContainText("공방온");

  const [carouselDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "캐러셀 ZIP 다운로드" }).click(),
  ]);
  const carouselZip = await JSZip.loadAsync(await downloadBytes(carouselDownload));
  expect(Object.keys(carouselZip.files).sort()).toEqual([...carouselFileNames].sort());
  for (const fileName of carouselFileNames) {
    const bytes = await carouselZip.file(fileName)!.async("uint8array");
    expect(pngDimensions(bytes)).toEqual({ width: 1080, height: 1350 });
  }

  const [metaDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Meta 게시 준비 다운로드" }).click(),
  ]);
  const metaZip = await JSZip.loadAsync(await downloadBytes(metaDownload));
  const metaText = await metaZip.file("meta-ready.txt")!.async("string");
  expect(metaText).toContain("상품명: 공방온");
  expect(metaText).toContain("핵심 특징: 빈자리 한 번 입력 · 이웃 대상 공개 페이지 · 개인정보 없는 참여 의향 수집");

  await page.goto(`/p/${campaign.slug}`);
  await expect(page.locator(".public-landing")).toHaveAttribute("data-product-name", "공방온");
  await expect(page.getByText("공방온", { exact: true }).first()).toBeVisible();
  for (const feature of ["빈자리 한 번 입력", "이웃 대상 공개 페이지", "개인정보 없는 참여 의향 수집"]) {
    await expect(page.getByText(feature, { exact: true }).first()).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});

test("API가 잘못된 입력, 크기 제한, 소유권과 없는 리소스를 명시적으로 거절한다", async ({ request }) => {
  await expectApiError(await request.post("/api/generate", {
    data: { background: "짧음", solution: "역시 짧음" },
  }), 400, "invalid_request");

  await expectApiError(await request.post("/api/generate", {
    headers: { "Content-Type": "application/json" },
    data: Buffer.from("{", "utf8"),
  }), 400, "invalid_json");

  await expectApiError(await request.post("/api/generate", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ background: "가".repeat(9_000), solution: "나".repeat(20) }),
  }), 413, "payload_too_large");

  await expectApiError(await request.get("/api/campaigns"), 400, "invalid_request");
  await expectApiError(await request.get("/api/campaigns?id=missing"), 404, "campaign_not_found");
  await expectApiError(await request.patch("/api/campaigns", {
    data: { campaignId: "demo", draftId: "wrong-draft", nextAction: "continue" },
  }), 403, "draft_mismatch");
  await expectApiError(await request.post("/api/signals", {
    data: { campaignId: "missing", visitorId: "visitor-api-boundary", optionId: "positive" },
  }), 404, "campaign_not_found");
  await expectApiError(await request.post("/api/signals", {
    data: { campaignId: "demo", visitorId: "visitor-api-boundary", optionId: "unsupported" },
  }), 400, "invalid_request");

  expect((await request.put("/api/generate", { data: {} })).status()).toBe(405);
  expect((await request.get("/campaigns/missing")).status()).toBe(404);
  expect((await request.get("/campaigns/missing/progress")).status()).toBe(404);
  expect((await request.get("/p/missing")).status()).toBe(404);
});

test("무응답과 긍정 기준 부족 상태를 숫자로 왜곡하지 않는다", async ({ page }) => {
  let state: "empty" | "positive-gap" = "empty";
  await page.route("**/api/campaigns*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    const summary = state === "empty"
      ? {
          positive: 0,
          neutral: 0,
          negative: 0,
          total: 0,
          positiveRate: null,
          decisionStatus: "no_responses",
          isRuleMet: false,
          remainingResponses: 5,
          remainingPositiveResponses: 3,
        }
      : {
          positive: 2,
          neutral: 2,
          negative: 1,
          total: 5,
          positiveRate: 0.4,
          decisionStatus: "threshold_not_met",
          isRuleMet: false,
          remainingResponses: 0,
          remainingPositiveResponses: 1,
        };
    await route.fulfill({ response, json: { ...body, summary } });
  });

  await page.goto("/campaigns/demo");
  await expect(positiveRateMetric(page)).toHaveText("—");
  await expect(page.getByText("응답 없음", { exact: true })).toBeVisible();
  await expect(remainingDecisionMetric(page)).toHaveText("5건");

  state = "positive-gap";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(positiveRateMetric(page)).toHaveText("40%");
  await expect(page.getByText("가설 재검토", { exact: true })).toBeVisible();
  await expect(remainingDecisionMetric(page)).toHaveText("1건");
});

test("375px과 키보드에서 필터, 생성, 공개 응답과 사람 판단을 조작할 수 있다", async ({ page }) => {
  const runtimeErrors: string[] = [];
  captureRuntimeErrors(page, runtimeErrors);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto("/");
  await expectNoHorizontalOverflow(page);
  const completedFilter = page.getByRole("button", { name: /검증 완료/ });
  await completedFilter.click();
  await expect(completedFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("완료된 검증이 아직 없어요.")).toBeVisible();
  await page.getByRole("button", { name: "진행 중 프로젝트 보기" }).click();

  await page.goto("/new");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "예시 불러오기" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "다음" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();

  await page.goto("/campaigns/demo");
  await expectNoHorizontalOverflow(page);
  const continueButton = page.getByRole("button", { name: /계속 검증/ });
  await continueButton.focus();
  await page.keyboard.press("Enter");
  await expect(continueButton).toHaveAttribute("aria-pressed", "true");

  await page.goto("/p/demo#signal");
  await expectNoHorizontalOverflow(page);
  const positiveOption = page.getByRole("button", { name: "네, 써보고 싶어요" });
  await positiveOption.focus();
  await page.keyboard.press("Space");
  await expect(positiveOption).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "익명으로 응답하기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("각 reference fixture가 고유 slug, SEO와 브랜드 테마를 유지한다", async ({ page, request }) => {
  const campaigns = await Promise.all([
    publishFixtureCampaign(request, {
      background: "예약 취소로 생기는 동네 공방 빈자리를 매번 다시 알리는 반복 업무를 줄이려 합니다.",
      solution: "서비스 이름은 ‘동네공방 빈자리’입니다. 핵심 특징은 빈자리 한 번 입력, 공개 안내 구성, 익명 참여 의향 수집입니다.",
    }),
    publishFixtureCampaign(request, {
      background: "독립 클래스 강사가 일정과 준비물 문의를 매번 반복해서 답하는 일을 줄이려 합니다.",
      solution: "서비스 이름은 ‘클래스 문의형’입니다. 핵심 특징은 수업 정보 한 번 입력, 문의 안내 구성, 익명 수강 의향 수집입니다.",
    }),
  ]);

  for (const campaign of campaigns) {
    expect(campaign.id).not.toBe(campaign.slug);
    expect((await request.get(`/p/${campaign.id}`)).status()).toBe(404);
    await page.goto(`/p/${campaign.slug}`);
    await expect(page).toHaveTitle(campaign.spec.landing.seoTitle);
    await expect(page.locator(".public-landing")).toHaveAttribute(
      "data-landing-template",
      campaign.spec.templates.landingIntro,
    );
    const theme = await page.locator(".public-landing").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        primary: style.getPropertyValue("--campaign-primary").trim(),
        accent: style.getPropertyValue("--campaign-accent").trim(),
      };
    });
    expect(theme).toEqual({
      primary: campaign.spec.brand.primaryColor,
      accent: campaign.spec.brand.accentColor,
    });
    const contrastPairs = [
      [".landing-primary-button"],
      [".landing-statement mark"],
      [".landing-kicker", ".public-landing"],
      [".landing-hero-copy small", ".public-landing"],
      [".landing-card-grid article > span", ".landing-card-grid article"],
      [".landing-statement > span", ".landing-statement"],
      [".benefit-list article > b", ".public-landing"],
      [".landing-how h2", ".landing-how"],
      [".how-track p", ".landing-how"],
      [".signal-copy p", ".signal-panel"],
    ] as const;
    for (const [textSelector, backgroundSelector] of contrastPairs) {
      expect(await computedContrastRatio(page, textSelector, backgroundSelector)).toBeGreaterThanOrEqual(4.5);
    }
  }

  expect(campaigns.map((campaign) => campaign.spec.project.name)).toEqual(["동네공방 빈자리", "클래스 문의형"]);
  expect(campaigns.map((campaign) => campaign.spec.templates)).toEqual([
    { carouselCover: "cover-32", landingIntro: "intro-6" },
    { carouselCover: "cover-34", landingIntro: "intro-7" },
  ]);
});

test("Figma 표지 3종과 랜딩 도입부 7종만 결정적으로 렌더링한다", async ({ page, request }) => {
  const generateResponse = await request.post("/api/generate", {
    data: {
      background: "마감 뒤 남은 메뉴와 게시물을 매번 다시 만드는 카페 운영자의 반복 업무를 줄이려 합니다.",
      solution: "남은 메뉴를 한 번 입력해 공개 안내와 게시 자료, 익명 관심 신호를 함께 준비합니다.",
    },
  });
  expect(generateResponse.ok()).toBe(true);
  const { spec: baseSpec } = await generateResponse.json();
  const landingTemplates = ["intro-1", "intro-2", "intro-3", "intro-4", "intro-5", "intro-6", "intro-7"] as const;
  const coverTemplates = ["cover-31", "cover-32", "cover-34"] as const;
  const exportedCovers = new Set<string>();

  for (const [index, landingIntro] of landingTemplates.entries()) {
    const carouselCover = coverTemplates[index % coverTemplates.length];
    const spec = structuredClone(baseSpec);
    spec.templates = { carouselCover, landingIntro };
    const publishResponse = await request.post("/api/campaigns", {
      data: { draftId: crypto.randomUUID(), spec },
    });
    expect(publishResponse.ok()).toBe(true);
    const campaign = await publishResponse.json();

    await page.goto(`/campaigns/${campaign.id}`);
    await expect(page.locator(".carousel-card-1")).toHaveAttribute(
      "data-carousel-cover-template",
      carouselCover,
    );
    if (!exportedCovers.has(carouselCover)) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "캐러셀 ZIP 다운로드" }).click(),
      ]);
      const zip = await JSZip.loadAsync(await downloadBytes(download));
      const coverBytes = await zip.file("01-hook.png")!.async("uint8array");
      expect(pngDimensions(coverBytes)).toEqual({ width: 1080, height: 1350 });
      expect(coverBytes.byteLength).toBeGreaterThan(carouselCover === "cover-31" ? 10_000 : 100_000);
      exportedCovers.add(carouselCover);
    }

    await page.goto(`/p/${campaign.slug}`);
    await expect(page.locator(".public-landing")).toHaveAttribute(
      "data-landing-template",
      landingIntro,
    );
    await expect(page.locator(".landing-intro-frame h1")).toBeVisible();
    await expect(page.locator(".landing-intro-frame")).toContainText(baseSpec.project.name);
    if (landingIntro === "intro-1" || landingIntro === "intro-3" || landingIntro === "intro-6" || landingIntro === "intro-7") {
      for (const benefit of baseSpec.landing.benefits) {
        await expect(page.locator(".landing-intro-frame")).toContainText(benefit.title);
      }
    }
    await expectNoHorizontalOverflow(page);
  }

  for (const assetPath of ["/figma-templates/cover-32.jpg", "/figma-templates/cover-34.jpg"]) {
    const assetResponse = await request.get(assetPath);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()["content-type"]).toContain("image/jpeg");
  }

  for (const carouselCover of coverTemplates) {
    const boundarySpec = structuredClone(baseSpec);
    boundarySpec.project.name = "가".repeat(80);
    boundarySpec.project.oneLiner = "나".repeat(120);
    boundarySpec.project.category = "카".repeat(80);
    boundarySpec.messaging.hooks[0] = "다".repeat(70);
    boundarySpec.carousel.hookBody = "라".repeat(180);
    boundarySpec.templates = { carouselCover, landingIntro: "intro-2" };
    const publishResponse = await request.post("/api/campaigns", {
      data: { draftId: crypto.randomUUID(), spec: boundarySpec },
    });
    expect(publishResponse.ok()).toBe(true);
    const campaign = await publishResponse.json();

    await page.goto(`/campaigns/${campaign.id}`);
    const coverBounds = await page.locator(".carousel-card-1").evaluate((element) => {
      const root = element.getBoundingClientRect();
      const body = element.querySelector<HTMLElement>(".carousel-cover-copy p")!.getBoundingClientRect();
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        copyBottom: body.bottom - root.top,
      };
    });
    if (carouselCover === "cover-31") {
      expect(coverBounds.scrollHeight).toBeLessThanOrEqual(coverBounds.clientHeight);
    }
    expect(coverBounds.copyBottom, carouselCover).toBeLessThanOrEqual(coverBounds.clientHeight);

    if (carouselCover === "cover-31") {
      await page.goto(`/p/${campaign.slug}`);
      const introBounds = await page.locator(".landing-intro-frame").evaluate((element) => {
        const heading = element.querySelector("h1")!.getBoundingClientRect();
        const art = element.querySelector(".intro-full-art")!.getBoundingClientRect();
        return { headingBottom: heading.bottom, artTop: art.top };
      });
      expect(introBounds.headingBottom).toBeLessThanOrEqual(introBounds.artTop);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("공개 응답 저장 실패를 성공으로 표시하지 않고 재시도한다", async ({ page }) => {
  await page.goto("/p/demo");
  await page.route("**/api/signals", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_failure", message: "test failure" } }),
    });
  });

  await page.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.locator(".signal-error")).toHaveText("응답을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
  expect(await computedContrastRatio(page, ".signal-error")).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "익명으로 응답하기" })).toBeEnabled();

  await page.unroute("**/api/signals");
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();
});

test("리포트 조회, 저장과 초기화 실패를 성공으로 표시하지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(responseMetric(page)).toHaveText("4건");

  await page.route("**/api/campaigns*", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "test_failure", message: "test failure" } }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await expect(page.locator(".toast-error")).toHaveText("다음 행동을 저장하지 못했어요. 다시 시도해주세요.");
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);
  await expect(page.getByText("다음 행동을 저장했어요.", { exact: true })).toHaveCount(0);

  await page.unroute("**/api/campaigns*");
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await expect(page.getByRole("status")).toHaveText("다음 행동을 저장했어요.");

  await page.route("**/api/campaigns/reset", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_failure", message: "test failure" } }),
    });
  });
  await page.getByRole("button", { name: "데모 데이터 초기화" }).click();
  await expect(page.locator(".toast-error")).toHaveText("데모 데이터를 초기화하지 못했어요. 다시 시도해주세요.");
  await expect(page.locator(".decision-grid button.selected")).toContainText("계속 검증");
  await expect(page.getByText("발표용 응답과 판단을 초기화했어요.", { exact: true })).toHaveCount(0);

  await page.unroute("**/api/campaigns/reset");
  await page.getByRole("button", { name: "데모 데이터 초기화" }).click();
  await expect(page.getByRole("status")).toHaveText("발표용 응답과 판단을 초기화했어요.");
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);

  await page.route("**/api/campaigns*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "test_failure", message: "test failure" } }),
      });
      return;
    }
    await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".toast-error")).toHaveText("최신 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
  await page.unroute("**/api/campaigns*");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".toast-error")).toHaveCount(0);
});

test("게시 응답이 유실돼도 같은 draft와 생성 결과로 재시도한다", async ({ page }) => {
  let firstPublishedId = "";
  let generateRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/generate") {
      generateRequests += 1;
    }
  });
  await page.route("**/api/campaigns", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const published = await response.json();
    firstPublishedId = published.id;
    await route.abort("failed");
  });

  await page.goto("/new");
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page.locator(".form-error")).toHaveText("광고 생성에 실패했어요. 다시 시도해주세요.");
  expect(firstPublishedId).not.toBe("");

  await page.unroute("**/api/campaigns");
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page).toHaveURL(new RegExp(`/campaigns/${firstPublishedId}/progress$`));
  expect(generateRequests).toBe(1);
});

test("새 광고를 게시해도 이미 열린 공개 랜딩의 상태가 섞이지 않는다", async ({ page, request }) => {
  const first = await publishFixtureCampaign(request, {
    background: "마감 뒤 남은 메뉴와 폐기를 줄이려는 동네 카페 사장님의 반복 업무입니다.",
    solution: "서비스 이름은 ‘마감한입’입니다. 핵심 특징은 남은 메뉴 한 번 입력, 공개 안내 구성, 익명 구매 의향 수집입니다.",
  });
  await page.goto(`/p/${first.slug}`);
  await expect(page.getByText("마감한입", { exact: true }).first()).toBeVisible();

  const second = await publishFixtureCampaign(request, {
    background: "예약 취소로 생기는 동네 공방 빈자리를 매번 다시 알리는 반복 업무입니다.",
    solution: "서비스 이름은 ‘공방온’입니다. 핵심 특징은 빈자리 한 번 입력, 공개 안내 구성, 익명 참여 의향 수집입니다.",
  });
  expect(second.id).not.toBe(first.id);
  expect(second.slug).not.toBe(first.slug);

  await page.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();

  const firstReport = await request.get(`/api/campaigns?id=${first.id}`).then((response) => response.json());
  const secondReport = await request.get(`/api/campaigns?id=${second.id}`).then((response) => response.json());
  expect(firstReport.summary.total).toBe(5);
  expect(secondReport.summary.total).toBe(4);
});

test("늦게 도착한 polling 응답이 저장한 판단을 되돌리지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(responseMetric(page)).toHaveText("4건");

  let releaseDelayedResponse!: () => void;
  let markRequestStarted!: () => void;
  const delayedResponseReleased = new Promise<void>((resolve) => { releaseDelayedResponse = resolve; });
  const delayedRequestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
  let delayed = false;
  await page.route("**/api/campaigns*", async (route) => {
    const request = route.request();
    if (!delayed && request.method() === "GET") {
      delayed = true;
      const staleResponse = await route.fetch();
      markRequestStarted();
      await delayedResponseReleased;
      await route.fulfill({ response: staleResponse });
      return;
    }
    await route.continue();
  });

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await delayedRequestStarted;
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await expect(page.getByRole("status")).toHaveText("다음 행동을 저장했어요.");
  releaseDelayedResponse();
  await page.waitForTimeout(250);
  await expect(page.locator(".decision-grid button.selected")).toContainText("계속 검증");
});

test("2초보다 느린 polling 응답도 겹치지 않고 화면에 반영한다", async ({ page }) => {
  let inFlight = 0;
  let maxInFlight = 0;

  await page.route("**/api/campaigns*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const response = await route.fetch();
    const body = await response.json();
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    inFlight -= 1;
    await route.fulfill({
      response,
      json: {
        ...body,
        summary: {
          ...body.summary,
          total: 9,
        },
      },
    });
  });

  await page.goto("/campaigns/demo");
  await expect(responseMetric(page)).toHaveText("9건", { timeout: 6_000 });
  expect(maxInFlight).toBe(1);
});
