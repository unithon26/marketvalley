import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

const background = "초기 창업자가 시장 반응을 보려고 같은 설명을 랜딩페이지와 광고 채널마다 반복해서 다시 만드는 문제가 있습니다.";
const solution = "서비스 이름은 공방온입니다. 한 번 입력하면 실제 랜딩페이지와 카드뉴스를 만들고 예약 반응을 한곳에 모읍니다.";

async function signIn(page: Page, next = "/") {
  await page.goto(`/auth/google?next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll("/", "\\/")}$`));
}

async function createCampaignThroughUi(page: Page) {
  await signIn(page, "/new");
  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page).toHaveURL(/\/campaigns\/([^/]+)\/progress$/);
  const campaignId = new URL(page.url()).pathname.split("/")[2];
  await expect(page.getByRole("heading", { name: "시장 검증이 완료되었습니다" })).toBeVisible();
  return campaignId;
}

test("첫 방문에는 계정 밖의 더미 프로젝트나 데모 동작이 보이지 않는다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Google로 로그인하면 이 계정의 진행 상황을 이어서 볼 수 있어요.")).toBeVisible();
  await expect(page.getByText(/마켓밸리 데모|DEMO|발표용/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "예시 불러오기" })).toHaveCount(0);
});

test("작성값을 보존하고 접수부터 실제 결과 화면까지 이어진다", async ({ page }) => {
  await signIn(page, "/new");
  await expect(page.getByRole("button", { name: "예시 불러오기" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "제품 배경" }).fill(background);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(solution);
  await page.getByRole("button", { name: "이전" }).click();
  await expect(page.getByRole("textbox", { name: "제품 배경" })).toHaveValue(background);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("textbox", { name: "솔루션 설명" })).toHaveValue(solution);

  await page.getByRole("button", { name: /광고 만들기/ }).click();
  await expect(page).toHaveURL(/\/campaigns\/([^/]+)\/progress$/);
  await expect(page.getByRole("button", { name: "메인으로" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "시장 검증 리포트 확인하기" })).toBeVisible();
  await page.getByRole("link", { name: "시장 검증 리포트 확인하기" }).click();

  await expect(page.getByText("검증 결과", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "광고 카드뉴스 소재" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "예약자 리스트" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ADS MANAGER PAUSED|실제 광고 활성화|광고 일시정지/ })).toHaveCount(0);
});

test("생성된 카드 5장과 ZIP은 같은 서버 렌더 결과를 사용한다", async ({ page }) => {
  const campaignId = await createCampaignThroughUi(page);
  await page.getByRole("link", { name: "시장 검증 리포트 확인하기" }).click();

  for (let index = 1; index <= 5; index += 1) {
    const response = await page.request.get(`/api/campaigns/${campaignId}/cards/${index}`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1350);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "카드뉴스 저장" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const zip = await JSZip.loadAsync(await import("node:fs/promises").then((fs) => fs.readFile(path!)));
  expect(Object.keys(zip.files).sort()).toEqual([
    "01-hook.png",
    "02-problem.png",
    "03-insight.png",
    "04-solution.png",
    "05-cta.png",
  ]);
});

test("공개 랜딩의 실제 예약이 계정 리포트에 마스킹되어 반영된다", async ({ page, context }) => {
  const campaignId = await createCampaignThroughUi(page);
  const campaign = await page.request.get(`/api/campaigns?id=${campaignId}`);
  expect(campaign.ok()).toBeTruthy();
  const body = await campaign.json() as { slug: string };

  const publicPage = await context.newPage();
  await publicPage.goto(`/p/${body.slug}`);
  await expect(publicPage.getByText(/발표용|데모/)).toHaveCount(0);
  await publicPage.getByRole("textbox", { name: "이름", exact: true }).fill("홍길동");
  await publicPage.getByRole("textbox", { name: "이메일", exact: true }).fill("real.person@example.com");
  await publicPage.getByLabel("이름과 이메일 수집에 동의합니다").check();
  await publicPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(publicPage.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/campaigns/${campaignId}$`)),
    page.getByRole("link", { name: "시장 검증 리포트 확인하기" }).click(),
  ]);
  await page.reload();
  await expect(page.getByRole("cell", { name: "홍길동" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^re\*+@example\.com$/ })).toBeVisible();
  await expect(page.getByText("real.person@example.com", { exact: true })).toHaveCount(0);
});

test("로그인한 계정은 새로고침 뒤에도 기존 진행·완료 상태를 다시 불러온다", async ({ page }) => {
  await createCampaignThroughUi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "검증 완료" }).click();
  await expect(page.getByText("공방온", { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "검증 완료" }).click();
  await expect(page.getByText("공방온", { exact: true }).first()).toBeVisible();
});
