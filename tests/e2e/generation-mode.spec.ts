import { expect, test } from "@playwright/test";

test("fixture 모드에서도 사용자 입력 화면에 내부 실행 정보를 노출하지 않는다", async ({ page }) => {
  await page.goto("/auth/google?next=%2Fnew");
  await expect(page).toHaveURL(/\/new$/);

  await expect(page.getByText("안전 데모 · AI 호출 없음", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "예시 불러오기" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "제품 배경" }).fill(
    "시장 반응을 확인하려고 채널마다 같은 광고 문구와 이미지를 반복해서 만드는 일이 있습니다.",
  );
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("textbox", { name: "솔루션 설명" }).fill(
    "서비스 이름은 플로우체크입니다. 한 번 입력하면 실제 랜딩과 카드뉴스, 예약자명단을 연결합니다.",
  );
  await expect(page.getByRole("button", { name: /광고 만들기/ })).toBeEnabled();
});
