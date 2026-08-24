import { expect, test } from "@playwright/test";

test("fixture 기반 캠페인 생성부터 응답과 사람 판단까지 이어진다", async ({ page, request }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await request.delete("http://127.0.0.1:3000/api/campaigns");

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  await page.getByRole("link", { name: "새 캠페인" }).click();
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /캠페인 만들기/ }).click();
  await expect(page).toHaveURL(/\/campaigns\/demo\/progress$/);
  const reportLink = page.getByRole("link", { name: /검증 리포트 확인하기/ });
  await expect(reportLink).toBeVisible({ timeout: 5_000 });
  await reportLink.click();

  await expect(page.getByText("4건", { exact: true }).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "캐러셀 ZIP 다운로드" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("demo-carousel.zip");

  await page.goto("/p/demo");
  await page.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();
  await page.getByRole("link", { name: "데모 리포트에서 확인하기" }).click();

  await expect(page.getByText("5건", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("기준 도달", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await page.reload();
  await expect(page.locator(".decision-grid button.selected")).toContainText("계속 검증");
  expect(runtimeErrors).toEqual([]);
});
