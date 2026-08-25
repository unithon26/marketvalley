import { expect, test } from "@playwright/test";

test("빌드와 실행 환경이 달라도 요청 시점의 fixture 모드를 표시한다", async ({ page }) => {
  await page.goto("/auth/google?next=%2Fnew");
  await expect(page).toHaveURL(/\/new$/);

  await expect(page.getByText("안전 데모 · AI 호출 없음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("button", { name: /광고 만들기/ })).toBeEnabled();
});
