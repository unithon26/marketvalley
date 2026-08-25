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
  expect(response.headers()["cache-control"]).toContain("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
}

async function openCompletedCampaign(page: Page, campaignId?: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "시장 검증이 완료되었습니다" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "시장 검증 리포트 확인하기" }).click();
  await expect(page).toHaveURL(
    campaignId ? new RegExp(`/campaigns/${campaignId}$`) : /\/campaigns\/[^/]+$/,
    { timeout: 5_000 },
  );
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

test.beforeEach(async ({ page, request }) => {
  const response = await request.delete("/api/campaigns");
  expect(response.ok()).toBe(true);
  await page.goto("/auth/google?next=%2F");
  await expect(page).toHaveURL(/\/$/);
});

test("발표용 GNB는 비로그인 상태에서 Google 로그인을 제공한다", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Google로 로그인" })).toBeVisible();
  await expect(page.getByRole("link", { name: /마감한입/ })).toBeVisible();
  await expect(page.getByText("동네공방 빈자리", { exact: true })).toBeVisible();
  await expect(page.getByText("클래스 문의함", { exact: true })).toBeVisible();
});

test("서비스 루트는 Figma 메인 프로젝트 화면과 제품 플로우를 보여준다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "전체 프로젝트" })).toBeVisible();
  await expect(page.getByText("마켓밸리 데모", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "프로젝트" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "새 광고" })).toHaveAttribute("href", "/new");
  await expect(page.getByRole("link", { name: /마감한입/ })).toHaveAttribute("href", "/campaigns/demo");
  await expect(page.locator("main")).not.toContainText(/THE PROBLEM|THE METHOD|START VALIDATION/u);
  await expectNoHorizontalOverflow(page);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "전체 프로젝트" })).toBeVisible();
});

test("로그인 화면의 Google 목 로그인은 로그인된 메인으로 돌아온다", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/login?next=%2Fnew");
  await expect(page.getByRole("img", { name: "market valley" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /시장 검증을 시작하려면/ })).toBeVisible();
  await page.getByRole("link", { name: "Google 계정으로 로그인" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "전체 프로젝트" })).toBeVisible();
  await expect(page.getByText("마켓밸리 데모", { exact: true })).toBeVisible();
});

test("비로그인 메인의 새 광고는 로그인 모달을 열고 Google 목 로그인 뒤 메인으로 돌아온다", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.getByRole("link", { name: "새 광고" }).click();
  await expect(page.getByRole("dialog", { name: /시장 검증을 시작하려면/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /마감한입/ })).toBeVisible();
  await expect(page.getByText("동네공방 빈자리", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Google 계정으로 로그인" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("마켓밸리 데모", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "새 광고" }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("heading", { name: "제품을 만들게 된 배경을 입력해주세요" })).toBeVisible();
});

test("발표용 로그아웃은 목 세션만 지우고 메인으로 돌아온다", async ({ page }) => {
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Google로 로그인" })).toBeVisible();
});

test("광고 입력 2단계는 브라우저 뒤로가기로 입력값을 보존한 1단계에 돌아간다", async ({ page }) => {
  const background = "카페 마감 메뉴를 알리기 위해 매일 같은 광고를 다시 만드는 반복 작업이 있습니다.";
  const solution = "마감한입은 메뉴를 한 번 입력하면 랜딩과 카드뉴스를 함께 준비하는 서비스입니다.";

  await page.goto("/new");
  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "제품 배경" })).toHaveValue(background);

  await page.goForward();
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "솔루션 설명" })).toHaveValue(solution);

  await page.getByRole("button", { name: "이전" }).click();
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "제품 배경" })).toHaveValue(background);
});

test("접수 뒤 실제 광고 제작을 기다리고 게시 후 시장 데이터 수집을 보여준다", async ({ page }) => {
  let generateStarted = false;
  let publishStarted = false;
  let releaseGenerate = () => {};
  let releasePublish = () => {};
  const generateGate = new Promise<void>((resolve) => { releaseGenerate = resolve; });
  const publishGate = new Promise<void>((resolve) => { releasePublish = resolve; });

  await page.route("**/api/generate", async (route) => {
    generateStarted = true;
    await generateGate;
    await route.continue();
  });
  await page.route("**/api/campaigns", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    publishStarted = true;
    await publishGate;
    await route.continue();
  });

  await page.goto("/new");
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /광고 만들기/ }).click();

  await expect(page.getByRole("heading", { name: "제출 내용을 검토하고 있습니다" })).toBeVisible();
  await page.waitForTimeout(350);
  expect(generateStarted).toBe(false);

  await expect(page.getByRole("heading", { name: "광고 검증을 준비하고 있습니다" })).toBeVisible({ timeout: 2_000 });
  expect(generateStarted).toBe(true);
  expect(publishStarted).toBe(false);

  releaseGenerate();
  await expect(page.getByRole("heading", { name: "시장 반응 데이터를 수집하고 있습니다" })).toBeVisible();
  expect(publishStarted).toBe(true);

  releasePublish();
  await page.waitForTimeout(1_000);
  await expect(page.getByRole("heading", { name: "시장 반응 데이터를 수집하고 있습니다" })).toBeVisible();
  await openCompletedCampaign(page);
});

test("접수 확인 중 화면을 이탈하면 유료 생성을 시작하지 않는다", async ({ page }) => {
  let generateRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/generate") {
      generateRequests += 1;
    }
  });

  await page.goto("/new");
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page.getByRole("heading", { name: "제출 내용을 검토하고 있습니다" })).toBeVisible();

  await page.getByRole("link", { name: "메인으로" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(900);
  expect(generateRequests).toBe(0);
});

test("AI 생성 실패 뒤 두 입력을 보존하고 새 생성 요청으로 재시도한다", async ({ page }) => {
  const background = "마감 메뉴 광고를 채널마다 다시 만들고 문의를 확인하는 반복 업무를 줄이고 싶습니다.";
  const solution = "마감한입은 남은 메뉴 한 번 입력으로 공개 랜딩과 카드뉴스를 만들고 예약자명단을 받습니다.";
  let generateRequests = 0;

  await page.route("**/api/generate", async (route) => {
    generateRequests += 1;
    if (generateRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "campaign_generation_unavailable",
            message: "문구를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/new");
  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await page.getByRole("button", { name: /광고 만들기/ }).click();

  await expect(page.locator(".form-error")).toHaveText("광고 생성에 실패했어요. 다시 시도해주세요.", { timeout: 5_000 });
  await expect(page.getByRole("textbox", { name: "솔루션 설명" })).toHaveValue(solution);
  await page.getByRole("button", { name: "이전" }).click();
  await expect(page.getByRole("textbox", { name: "제품 배경" })).toHaveValue(background);
  await page.goForward();
  await expect(page.getByRole("textbox", { name: "솔루션 설명" })).toHaveValue(solution);

  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await openCompletedCampaign(page);
  expect(generateRequests).toBe(2);
});

test("fixture 생성부터 Figma 리포트, 산출물과 예약까지 실제 API 경계로 이어진다", async ({ context, page, request }) => {
  const runtimeErrors: string[] = [];
  captureRuntimeErrors(page, runtimeErrors);
  const visitorEmail = "e2e-flow@example.com";

  await page.goto("/");
  await context.grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin: new URL(page.url()).origin },
  );
  await page.evaluate(() => window.localStorage.clear());

  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await page.getByRole("link", { name: "새 광고" }).click();
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /광고 만들기/ }).click();

  await expect(page.getByRole("heading", { name: "제출 내용을 검토하고 있습니다" })).toBeVisible();
  await openCompletedCampaign(page);
  const campaignId = decodeURIComponent(page.url().match(/\/campaigns\/([^/]+)$/)?.[1] ?? "");
  expect(campaignId).not.toBe("");
  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await expect(page.locator("body")).not.toContainText(/캠페인|CampaignSpec/u);
  await expect(page.locator(".figma-report-page")).toHaveAttribute("data-market-fit", "very-suitable");
  await expect(page.getByRole("heading", { name: "[매우 적합]" })).toBeVisible();
  await expect(page.getByText("1,800,820회", { exact: true })).toBeVisible();
  await expect(page.getByText("12.6%", { exact: true })).toBeVisible();
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(4);

  const campaignResponse = await request.get(`/api/campaigns?id=${campaignId}`);
  expect(campaignResponse.ok()).toBe(true);
  const campaign = await campaignResponse.json();
  expect(campaign.spec.project.name).toBe("마감한입");
  expect(campaign.spec.landing.benefits.map((benefit: { title: string }) => benefit.title)).toEqual([
    "남은 메뉴 한 번 입력",
    "공개 페이지와 게시 카드 동시 생성",
    "동의 기반 예약자명단",
  ]);
  await expect(page.locator(".carousel-card-1")).toHaveAttribute(
    "data-carousel-cover-template",
    campaign.spec.templates.carouselCover,
  );
  await expect(page.locator(".carousel-card-1")).toHaveAttribute("data-product-name", "마감한입");
  await expect(page.locator(".carousel-card-3")).toContainText("공개 페이지와 게시 카드 동시 생성");
  const carouselDownloadButton = page.getByRole("button", { name: "카드뉴스 저장" });
  await expect(page.getByRole("img", { name: "광고 카드뉴스 소재" })).toBeVisible();
  await expect(page.getByRole("img", { name: "랜딩페이지 미리보기" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    carouselDownloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${campaignId}-carousel.zip`);
  const carouselZip = await JSZip.loadAsync(await downloadBytes(download));
  expect(Object.keys(carouselZip.files).sort()).toEqual([...carouselFileNames].sort());
  await expectCarouselEntries(carouselZip);

  const [landingPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "서비스 바로가기" }).click(),
  ]);
  captureRuntimeErrors(landingPage, runtimeErrors);
  await landingPage.waitForLoadState("domcontentloaded");
  await expect(landingPage.locator(".public-landing")).toHaveAttribute(
    "data-landing-template",
    campaign.spec.templates.landingIntro,
  );
  await expect(landingPage.locator(".public-landing")).toHaveAttribute("data-product-name", "마감한입");
  await expect(landingPage.getByText("#남은 메뉴 한 번 입력", { exact: true })).toBeVisible();
  await landingPage.getByRole("textbox", { name: "이름" }).fill("예약테스트");
  await landingPage.getByRole("textbox", { name: "이메일" }).fill(visitorEmail);
  await landingPage.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await landingPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();

  await page.bringToFront();
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(5);
  await expect(page.locator(".reservation-table tbody tr").first()).toContainText("예약테스트");

  await landingPage.bringToFront();
  await landingPage.reload();
  await landingPage.getByRole("textbox", { name: "이름" }).fill("중복테스트");
  await landingPage.getByRole("textbox", { name: "이메일" }).fill(visitorEmail.toUpperCase());
  await landingPage.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await landingPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "이미 예약했어요" })).toBeVisible();

  await page.bringToFront();
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(5);

  expect(runtimeErrors.filter((message) => !message.includes("status of 409 (Conflict)"))).toEqual([]);
  expect(runtimeErrors.filter((message) => message.includes("status of 409 (Conflict)"))).toHaveLength(1);
});

test("입력한 상품명과 특징이 랜딩과 카드뉴스에 자동으로 이어진다", async ({ page, request }) => {
  const background = "예약 취소가 생길 때마다 동네 공방 빈자리 안내를 여러 채널에 다시 만들어 올리는 일이 반복됩니다.";
  const solution = "서비스 이름은 ‘공방온’입니다. 핵심 특징은 빈자리 한 번 입력, 이웃 대상 공개 페이지, 동의 기반 예약자명단입니다. 공방 운영자의 안내 광고를 자동으로 만듭니다.";

  await page.goto("/new");
  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page.getByRole("heading", { name: "제출 내용을 검토하고 있습니다" })).toBeVisible();
  await openCompletedCampaign(page);

  const campaignId = decodeURIComponent(page.url().match(/\/campaigns\/([^/]+)$/)?.[1] ?? "");

  const campaignResponse = await request.get(`/api/campaigns?id=${campaignId}`);
  expect(campaignResponse.ok()).toBe(true);
  const campaign = await campaignResponse.json();
  expect(campaign.spec.project.name).toBe("공방온");
  expect(campaign.spec.landing.benefits.map((benefit: { title: string }) => benefit.title)).toEqual([
    "빈자리 한 번 입력",
    "이웃 대상 공개 페이지",
    "동의 기반 예약자명단",
  ]);

  await expect(page.locator(".carousel-card-1")).toHaveAttribute("data-product-name", "공방온");
  await expect(page.locator(".carousel-card-3")).toContainText("이웃 대상 공개 페이지");
  await expect(page.locator(".carousel-card-4")).toContainText("공방온");

  const [carouselDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "카드뉴스 저장" }).click(),
  ]);
  const carouselZip = await JSZip.loadAsync(await downloadBytes(carouselDownload));
  expect(Object.keys(carouselZip.files).sort()).toEqual([...carouselFileNames].sort());
  for (const fileName of carouselFileNames) {
    const bytes = await carouselZip.file(fileName)!.async("uint8array");
    expect(pngDimensions(bytes)).toEqual({ width: 1080, height: 1350 });
  }

  await page.goto(`/p/${campaign.slug}`);
  await expect(page.locator(".public-landing")).toHaveAttribute("data-product-name", "공방온");
  await expect(page.getByText("공방온", { exact: true }).first()).toBeVisible();
  for (const feature of ["빈자리 한 번 입력", "이웃 대상 공개 페이지", "동의 기반 예약자명단"]) {
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
  await expectApiError(await request.post("/api/reservations", {
    data: { campaignId: "missing", name: "테스트", email: "api-boundary@example.com", consent: true },
  }), 404, "campaign_not_found");
  await expectApiError(await request.post("/api/reservations", {
    data: { campaignId: "demo", name: "테스트", email: "not-an-email", consent: true },
  }), 400, "invalid_request");

  expect((await request.put("/api/generate", { data: {} })).status()).toBe(405);
  expect((await request.get("/campaigns/missing")).status()).toBe(404);
  expect((await request.get("/campaigns/missing/progress")).status()).toBe(404);
  expect((await request.get("/p/missing")).status()).toBe(404);
});

test("예약자명단이 비어있거나 채워진 상태를 실제 데이터로만 표시한다", async ({ page }) => {
  let state: "empty" | "populated" = "empty";
  await page.route("**/api/campaigns*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    const summary = state === "empty"
      ? { total: 0, recent: [] }
      : {
          total: 3,
          recent: [
            { id: "r-3", name: "박세번째", email: "third@example.com", reservedAt: "2026-08-25T09:20:00.000Z" },
            { id: "r-2", name: "이두번째", email: "second@example.com", reservedAt: "2026-08-25T09:10:00.000Z" },
            { id: "r-1", name: "김첫번째", email: "first@example.com", reservedAt: "2026-08-25T09:00:00.000Z" },
          ],
        };
    await route.fulfill({ response, json: { ...body, summary } });
  });

  await page.goto("/campaigns/demo");
  await expect(page.getByText("아직 예약이 없어요.", { exact: true })).toBeVisible();

  state = "populated";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".reservation-table tbody tr").first()).toContainText("박세번째");
  await expect(page.locator(".reservation-table tbody tr").first()).toContainText("th****@example.com");
});

test("375px과 키보드에서 필터, 생성, 리포트와 공개 응답을 조작할 수 있다", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "[매우 적합]" })).toBeVisible();
  const shareButton = page.getByRole("button", { name: "리포트 공유하기" });
  await shareButton.focus();
  await expect(shareButton).toBeFocused();

  await page.goto("/p/demo#reserve");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("textbox", { name: "이름" }).fill("키보드테스트");
  await page.getByRole("textbox", { name: "이메일" }).fill("keyboard-375@example.com");
  const consentCheckbox = page.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" });
  await consentCheckbox.focus();
  await page.keyboard.press("Space");
  await expect(consentCheckbox).toBeChecked();
  await page.getByRole("button", { name: "사전예약하기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("각 reference fixture가 고유 slug, SEO와 브랜드 테마를 유지한다", async ({ page, request }) => {
  const campaigns = await Promise.all([
    publishFixtureCampaign(request, {
      background: "예약 취소로 생기는 동네 공방 빈자리를 매번 다시 알리는 반복 업무를 줄이려 합니다.",
      solution: "서비스 이름은 ‘동네공방 빈자리’입니다. 핵심 특징은 빈자리 한 번 입력, 공개 안내 구성, 동의 기반 예약자명단입니다.",
    }),
    publishFixtureCampaign(request, {
      background: "독립 클래스 강사가 일정과 준비물 문의를 매번 반복해서 답하는 일을 줄이려 합니다.",
      solution: "서비스 이름은 ‘클래스 문의형’입니다. 핵심 특징은 수업 정보 한 번 입력, 문의 안내 구성, 동의 기반 예약자명단입니다.",
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
        page.getByRole("button", { name: "카드뉴스 저장" }).click(),
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

  for (const assetPath of [
    "/figma-templates/cover-32-original.webp",
    "/figma-templates/cover-34-original.webp",
  ]) {
    const assetResponse = await request.get(assetPath);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()["content-type"]).toContain("image/webp");
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

test("공개 예약 저장 실패를 성공으로 표시하지 않고 재시도한다", async ({ page }) => {
  await page.goto("/p/demo");
  await page.route("**/api/reservations", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_failure", message: "test failure" } }),
    });
  });

  await page.getByRole("textbox", { name: "이름" }).fill("재시도테스트");
  await page.getByRole("textbox", { name: "이메일" }).fill("retry-failure@example.com");
  await page.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await page.getByRole("button", { name: "사전예약하기" }).click();
  await expect(page.locator(".signal-error")).toHaveText("예약을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
  expect(await computedContrastRatio(page, ".signal-error")).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByRole("heading", { name: "예약이 접수됐어요" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사전예약하기" })).toBeEnabled();

  await page.unroute("**/api/reservations");
  await page.getByRole("button", { name: "사전예약하기" }).click();
  await expect(page.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();
});

test("리포트 조회 실패를 성공으로 표시하지 않고 복구한다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(4);

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
  await openCompletedCampaign(page, firstPublishedId);
  expect(generateRequests).toBe(1);
});

test("새 광고를 게시해도 이미 열린 공개 랜딩의 상태가 섞이지 않는다", async ({ page, request }) => {
  const first = await publishFixtureCampaign(request, {
    background: "마감 뒤 남은 메뉴와 폐기를 줄이려는 동네 카페 사장님의 반복 업무입니다.",
    solution: "서비스 이름은 ‘마감한입’입니다. 핵심 특징은 남은 메뉴 한 번 입력, 공개 안내 구성, 동의 기반 예약자명단입니다.",
  });
  await page.goto(`/p/${first.slug}`);
  await expect(page.getByText("마감한입", { exact: true }).first()).toBeVisible();

  const second = await publishFixtureCampaign(request, {
    background: "예약 취소로 생기는 동네 공방 빈자리를 매번 다시 알리는 반복 업무입니다.",
    solution: "서비스 이름은 ‘공방온’입니다. 핵심 특징은 빈자리 한 번 입력, 공개 안내 구성, 동의 기반 예약자명단입니다.",
  });
  expect(second.id).not.toBe(first.id);
  expect(second.slug).not.toBe(first.slug);

  await page.getByRole("textbox", { name: "이름" }).fill("격리테스트");
  await page.getByRole("textbox", { name: "이메일" }).fill("isolation@example.com");
  await page.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await page.getByRole("button", { name: "사전예약하기" }).click();
  await expect(page.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();

  const firstReport = await request.get(`/api/campaigns?id=${first.id}`).then((response) => response.json());
  const secondReport = await request.get(`/api/campaigns?id=${second.id}`).then((response) => response.json());
  expect(firstReport.summary.total).toBe(5);
  expect(secondReport.summary.total).toBe(4);
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
          recent: Array.from({ length: 9 }, (_, index) => ({
            id: `slow-${index}`,
            name: `예약자${index + 1}`,
            email: `slow-${index}@example.com`,
            reservedAt: `2026-08-25T09:${String(index).padStart(2, "0")}:00.000Z`,
          })),
        },
      },
    });
  });

  await page.goto("/campaigns/demo");
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(9, { timeout: 6_000 });
  expect(maxInFlight).toBe(1);
});
