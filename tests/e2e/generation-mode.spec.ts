import { expect, test } from "@playwright/test";

test("fixture 모드에서도 사용자 입력 화면에 내부 실행 정보를 노출하지 않는다", async ({ page }) => {
  await page.goto("/auth/google?next=%2Fnew");
  await expect(page).toHaveURL(/\/new$/);

  await expect(page.getByText("안전 데모 · AI 호출 없음", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "예시 불러오기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("button", { name: /광고 만들기/ })).toBeEnabled();
});
