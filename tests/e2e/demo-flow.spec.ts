import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page, runtimeErrors: string[]) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
}

function responseMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "선택형 응답" }).locator("strong");
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

test("fixture 생성부터 응답, 판단, 초기화까지 실제 API 경계로 이어진다", async ({ context, page }) => {
  const runtimeErrors: string[] = [];
  captureRuntimeErrors(page, runtimeErrors);

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  await page.getByRole("link", { name: "새 프로젝트" }).click();
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /프로젝트 만들기/ }).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+\/progress$/);
  const campaignId = decodeURIComponent(page.url().match(/\/campaigns\/([^/]+)\/progress$/)?.[1] ?? "");
  expect(campaignId).not.toBe("");
  const reportLink = page.getByRole("link", { name: /검증 리포트 확인하기/ });
  await expect(reportLink).toBeVisible({ timeout: 5_000 });
  await reportLink.click();

  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));
  await expect(responseMetric(page)).toHaveText("4건");
  await expect(page.getByText("긍정 2 / 전체 4", { exact: true })).toBeVisible();
  await expect(page.getByText("표본 수 부족", { exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "캐러셀 ZIP 다운로드" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${campaignId}-carousel.zip`);

  const [landingPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "공개 랜딩 열기" }).first().click(),
  ]);
  captureRuntimeErrors(landingPage, runtimeErrors);
  await landingPage.waitForLoadState("domcontentloaded");
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
  await page.getByRole("button", { name: /프로젝트 만들기/ }).click();
  await expect(page.locator(".form-error")).toHaveText("프로젝트 생성에 실패했어요. 다시 시도해주세요.");
  expect(firstPublishedId).not.toBe("");

  await page.unroute("**/api/campaigns");
  await page.getByRole("button", { name: /프로젝트 만들기/ }).click();
  await expect(page).toHaveURL(new RegExp(`/campaigns/${firstPublishedId}/progress$`));
  expect(generateRequests).toBe(1);
});

test("새 캠페인을 게시해도 이미 열린 공개 랜딩의 상태가 섞이지 않는다", async ({ page, request }) => {
  const first = await publishFixtureCampaign(request, {
    background: "마감 뒤 남은 메뉴와 폐기를 줄이려는 동네 카페 사장님의 반복 업무입니다.",
    solution: "남은 메뉴 안내와 익명 관심 응답을 한 번에 연결하는 공개 캠페인입니다.",
  });
  await page.goto(`/p/${first.slug}`);
  await expect(page.getByText("마감한입", { exact: true }).first()).toBeVisible();

  const second = await publishFixtureCampaign(request, {
    background: "예약 취소로 생기는 동네 공방 빈자리를 매번 다시 알리는 반복 업무입니다.",
    solution: "취소 자리를 공개 안내하고 개인정보 없이 관심 신호를 받는 캠페인입니다.",
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
