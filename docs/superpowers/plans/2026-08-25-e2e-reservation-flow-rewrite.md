# E2E 예약자명단 흐름 재작성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **이 저장소에서 실행하는 다른 도구(Codex 등)를 위한 안내:** 이 플랜은 Claude Code 세션이 아니라 별도 세션(Codex)이 실행할 것을 전제로 작성했다. 위 서브스킬 지시는 Claude Code 세션에만 해당하며, Codex는 아래 태스크를 순서대로 그대로 실행하면 된다. 각 태스크는 파일의 정확한 이전 텍스트(`old`)와 이후 텍스트(`new`)를 포함하므로 그대로 치환하면 된다.

**Goal:** `tests/e2e/demo-flow.spec.ts`가 옛 익명 3지선다 신호 흐름 대신 새 이름+이메일 예약자명단 흐름(ADR-0013)을 검증하도록 다시 쓴다.

**Architecture:** 앱 코드(계약·repository·API route·화면)는 이미 완전히 새 흐름으로 교체되어 커밋 `e56f697`에 push됐다. 이 플랜은 **테스트 코드만** 수정한다 — 프로덕션 코드는 건드리지 않는다. 한 파일(`tests/e2e/demo-flow.spec.ts`, 780줄)을 테스트 블록 단위로 나눠 순차 수정한다.

**Tech Stack:** Playwright (`@playwright/test`), Next.js 16 production build 기반 E2E (`playwright.config.ts`가 매 실행마다 `pnpm build && pnpm exec next start --port 3100`을 새로 띄운다 — 재사용하지 않는다).

**Spec:** `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md` (데이터 계약), `docs/decisions/0013-switch-anonymous-signal-to-named-reservation.md` (ADR-0013, 왜 바뀌었는지)

## Global Constraints

- 프로덕션 코드(`app/`, `components/`, `lib/`)는 이 플랜에서 수정하지 않는다. 테스트 파일만 수정한다.
- 이메일 정규화: 서버가 이메일을 `trim().toLowerCase()`로 정규화해 중복을 판정한다 (`lib/demo/fixtureRepository.ts`).
- 예약자명단 폼의 접근성 이름(accessible name)은 다음과 같이 고정돼 있다 — 임의로 다른 텍스트를 기대하지 않는다:
  - 이름 입력: `getByRole("textbox", { name: "이름" })`
  - 이메일 입력: `getByRole("textbox", { name: "이메일" })`
  - 동의 체크박스: `getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" })`
  - 제출 버튼: `getByRole("button", { name: "사전예약하기" })` (제출 중에는 텍스트가 "예약 접수 중..."로 바뀐다)
  - 성공 heading: `getByRole("heading", { name: "예약이 접수됐어요" })`
  - 중복 heading: `getByRole("heading", { name: "이미 예약했어요" })`
  - 실패 오류 문구 요소: `.signal-error` (텍스트: `예약을 저장하지 못했어요. 잠시 후 다시 시도해주세요.`)
- API 엔드포인트는 `/api/signals`가 아니라 `/api/reservations`다. 요청 바디: `{ campaignId, name, email, consent: true, utm? }`. 응답: `{ alreadyReserved: boolean, summary: { total, recent } }`. 중복 제출은 HTTP 409.
- 리포트 화면(`components/campaign-report.tsx`)의 실제 데이터 지표는 "예약자 수" 하나뿐이다(단위 "명"). "긍정 신호율", "기준 충족 최소 추가" 같은 옛 지표는 화면에서 완전히 사라졌다 — 이 문구들을 기대하는 assertion은 전부 삭제 대상이다.
- 예약자 리스트 테이블: `.reservation-table tbody tr`, 각 행은 `No / 이름 / 마스킹된 이메일` 3열. 리스트가 비어있으면 `아직 예약이 없어요.` 텍스트가 대신 보인다.
- "예시 지표" 라벨(`.example-tag`, 텍스트 `예시 지표`)이 노출 수·CTR·예약률 카드에 붙어 있다. 이 값들은 고정 상수이며 실제 응답 개수와 무관하다 — 이 값을 검증하는 테스트를 새로 추가할 필요는 없다.
- 검증 명령: `npx pnpm@11.15.1 exec playwright test -g "<test name>"` (이 머신은 `pnpm`이 전역 설치돼 있지 않다 — 반드시 `npx pnpm@11.15.1` 접두사를 쓴다. `TROUBLESHOOTING_A.md` 참고). 매 실행마다 production build가 새로 돌아가 1~2분 걸릴 수 있다.

---

### Task 1: 공용 helper 함수 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:15-25`

**Interfaces:**
- Produces: `reservationCountMetric(page)` — Task 2, 9, 12, 13이 이 helper를 사용한다.

- [ ] **Step 1: 옛 signal 지표 helper 3개를 예약자 수 helper 1개로 교체**

`old`:
```ts
function responseMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "선택형 응답" }).locator("strong");
}

function positiveRateMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "긍정 신호율" }).locator("strong");
}

function remainingDecisionMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "기준 충족 최소 추가" }).locator("strong");
}
```

`new`:
```ts
function reservationCountMetric(page: Page) {
  return page.locator(".metric-grid article").filter({ hasText: "예약자 수" }).locator("strong");
}
```

- [ ] **Step 2: 파일 전체에서 옛 helper 호출을 찾아 다음 태스크들에서 함께 교체한다 (지금은 이 파일이 컴파일 안 되는 중간 상태 — 정상이다)**

Run: 아직 실행하지 않는다. Task 2~13에서 모든 호출부를 교체한 뒤 마지막에 한 번에 실행한다.

---

### Task 2: 메인 종단 흐름 테스트 재작성

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:104-238` (`test("fixture 생성부터 산출물, 응답, 판단, 초기화까지 실제 API 경계로 이어진다", ...)`)

**Interfaces:**
- Consumes: `reservationCountMetric` from Task 1

- [ ] **Step 1: 테스트 본문 전체를 아래로 교체**

`old` (전체 테스트, L104-238):
```ts
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
```

`new`:
```ts
test("fixture 생성부터 산출물, 예약, 판단, 초기화까지 실제 API 경계로 이어진다", async ({ context, page, request }) => {
  const runtimeErrors: string[] = [];
  captureRuntimeErrors(page, runtimeErrors);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3100" });
  const visitorEmail = "e2e-flow@example.com";

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
  await expect(reservationCountMetric(page)).toHaveText("4명");

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
  await landingPage.getByRole("textbox", { name: "이름" }).fill("김지성");
  await landingPage.getByRole("textbox", { name: "이메일" }).fill(visitorEmail);
  await landingPage.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await landingPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();

  await page.bringToFront();
  await expect(reservationCountMetric(page)).toHaveText("5명");

  await landingPage.bringToFront();
  await landingPage.reload();
  await landingPage.getByRole("textbox", { name: "이름" }).fill("김지성");
  await landingPage.getByRole("textbox", { name: "이메일" }).fill(visitorEmail);
  await landingPage.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await landingPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "이미 예약했어요" })).toBeVisible();

  await page.bringToFront();
  await expect(reservationCountMetric(page)).toHaveText("5명");
  await page.getByRole("button", { name: /계속 검증/ }).click();
  await expect(page.getByRole("status")).toHaveText("다음 행동을 저장했어요.");
  await page.reload();
  await expect(page.locator(".decision-grid button.selected")).toContainText("계속 검증");

  await page.getByRole("button", { name: "데모 데이터 초기화" }).click();
  await expect(page.getByRole("status")).toHaveText("발표용 응답과 판단을 초기화했어요.");
  await expect(reservationCountMetric(page)).toHaveText("4명");
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);
  await page.reload();
  await expect(reservationCountMetric(page)).toHaveText("4명");
  await expect(page.locator(".decision-grid button.selected")).toHaveCount(0);

  await landingPage.bringToFront();
  await landingPage.reload();
  await landingPage.getByRole("textbox", { name: "이름" }).fill("김지성");
  await landingPage.getByRole("textbox", { name: "이메일" }).fill(visitorEmail);
  await landingPage.getByRole("checkbox", { name: "이름과 이메일 수집에 동의합니다" }).check();
  await landingPage.getByRole("button", { name: "사전예약하기" }).click();
  await expect(landingPage.getByRole("heading", { name: "예약이 접수됐어요" })).toBeVisible();

  expect(runtimeErrors.filter((message) => !message.includes("status of 409 (Conflict)"))).toEqual([]);
  expect(runtimeErrors.filter((message) => message.includes("status of 409 (Conflict)"))).toHaveLength(1);
});
```

- [ ] **Step 2: 이 테스트만 실행해 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "fixture 생성부터 산출물, 예약, 판단, 초기화까지"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 메인 종단 e2e를 예약자명단 흐름으로 재작성"
```

---

### Task 3: API 경계 거절 테스트의 signals → reservations 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:299-330`

- [ ] **Step 1: `/api/signals` 관련 두 assertion을 `/api/reservations` 기준으로 교체**

`old`:
```ts
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
```

`new`:
```ts
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
```

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "API가 잘못된 입력"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: API 경계 거절 테스트를 /api/reservations 기준으로 갱신"
```

---

### Task 4: "무응답과 긍정 기준 부족" 테스트를 예약자명단 없음/있음 테스트로 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:332-377`

이 테스트는 옛 `decisionStatus`/`positiveRate` mock을 검증했다. 그 개념 자체가 없어졌으므로, 같은 취지(실측 아닌 값을 화면이 왜곡하지 않는다)를 예약자명단 유무 상태로 다시 검증한다.

- [ ] **Step 1: 테스트 전체 교체**

`old` (전체, L332-377):
```ts
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
```

`new`:
```ts
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
  await expect(reservationCountMetric(page)).toHaveText("0명");
  await expect(page.getByText("아직 예약이 없어요.", { exact: true })).toBeVisible();

  state = "populated";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(reservationCountMetric(page)).toHaveText("3명");
  await expect(page.locator(".reservation-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".reservation-table tbody tr").first()).toContainText("박세번째");
  await expect(page.locator(".reservation-table tbody tr").first()).toContainText("th****@example.com");
});
```

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "예약자명단이 비어있거나 채워진 상태"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 긍정 신호율 테스트를 예약자명단 실측 표시 테스트로 교체"
```

---

### Task 5: 375px·키보드 테스트의 신호 구간을 예약 폼으로 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:379-417`

- [ ] **Step 1: `/p/demo#signal` 이후 블록을 예약 폼 키보드 조작으로 교체**

`old`:
```ts
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
```

`new`:
```ts
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
```

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "375px과 키보드에서"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 375px 키보드 조작 테스트를 예약 폼 기준으로 갱신"
```

---

### Task 6: 공개 응답 저장 실패 재시도 테스트를 예약 제출 실패로 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:578-598`

- [ ] **Step 1: 테스트 전체 교체**

`old` (전체):
```ts
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
```

`new`:
```ts
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
```

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "공개 예약 저장 실패"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 공개 응답 저장 실패 테스트를 예약 제출 실패 기준으로 교체"
```

---

### Task 7: 리포트 조회·저장·초기화 실패 테스트의 지표 문구 갱신

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:600-657`

- [ ] **Step 1: 첫 줄의 `responseMetric` 호출을 `reservationCountMetric`로 교체**

`old`:
```ts
test("리포트 조회, 저장과 초기화 실패를 성공으로 표시하지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(responseMetric(page)).toHaveText("4건");
```

`new`:
```ts
test("리포트 조회, 저장과 초기화 실패를 성공으로 표시하지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(reservationCountMetric(page)).toHaveText("4명");
```

이 테스트의 나머지 부분(PATCH/reset/GET 실패 시나리오, `.toast-error` 검증)은 신호 계약과 무관하므로 수정하지 않는다.

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "리포트 조회, 저장과 초기화 실패"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 리포트 실패 테스트의 지표 문구를 예약자 수 기준으로 갱신"
```

---

### Task 8: 광고 간 상태 격리 테스트를 예약 폼으로 교체

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:691-714`

- [ ] **Step 1: 신호 버튼 클릭을 예약 폼 제출로 교체**

`old`:
```ts
  await page.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();

  const firstReport = await request.get(`/api/campaigns?id=${first.id}`).then((response) => response.json());
  const secondReport = await request.get(`/api/campaigns?id=${second.id}`).then((response) => response.json());
  expect(firstReport.summary.total).toBe(5);
  expect(secondReport.summary.total).toBe(4);
});
```

`new`:
```ts
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
```

- [ ] **Step 2: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "이미 열린 공개 랜딩"`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: 광고 간 상태 격리 테스트를 예약 폼 기준으로 교체"
```

---

### Task 9: polling 관련 테스트 2건의 지표 문구 갱신

**Files:**
- Modify: `tests/e2e/demo-flow.spec.ts:716-745` (되돌리지 않는다 테스트)
- Modify: `tests/e2e/demo-flow.spec.ts:747-779` (겹치지 않고 반영한다 테스트)

- [ ] **Step 1: 첫 번째 polling 테스트의 두 `responseMetric` 호출 교체**

`old`:
```ts
test("늦게 도착한 polling 응답이 저장한 판단을 되돌리지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(responseMetric(page)).toHaveText("4건");
```

`new`:
```ts
test("늦게 도착한 polling 응답이 저장한 판단을 되돌리지 않는다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(reservationCountMetric(page)).toHaveText("4명");
```

- [ ] **Step 2: 두 번째 polling 테스트의 mock summary와 assertion을 새 계약으로 교체**

`old`:
```ts
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
```

`new`:
```ts
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
  await expect(reservationCountMetric(page)).toHaveText("9명", { timeout: 6_000 });
  expect(maxInFlight).toBe(1);
});
```

- [ ] **Step 3: 실행 확인**

Run: `npx pnpm@11.15.1 exec playwright test -g "polling"`
Expected: PASS (2 tests)

- [ ] **Step 4: 커밋**

```bash
git add tests/e2e/demo-flow.spec.ts
git commit -m "test: polling 테스트 2건의 지표 문구를 예약자 수 기준으로 갱신"
```

---

### Task 10: 전체 스위트 실행과 최종 확인

**Files:**
- 없음 (검증 전용)

- [ ] **Step 1: 전체 e2e 스위트 실행**

Run: `npx pnpm@11.15.1 test:e2e`
Expected: 13개 테스트 모두 PASS (변경하지 않은 테스트 4건 포함: "입력한 상품명과 특징이...", "각 reference fixture가...", "Figma 표지 3종과...", "게시 응답이 유실돼도...")

- [ ] **Step 2: 전체 검증 스위트 실행**

Run: `npx pnpm@11.15.1 check`
Expected: lint, typecheck, 단위 테스트, production build 모두 PASS

- [ ] **Step 3: origin/main 재확인 후 push**

이 저장소는 개발자 A(Claude Code)와 개발자 B(Codex)가 같은 `main`에 직접 push하는 구조라 두 세션이 동시에 작업 중일 수 있다. push 직전에 반드시 최신 상태를 다시 확인한다.

```bash
git fetch origin main
git log --oneline -5 origin/main
```

로컬과 다른 커밋이 origin/main에 있다면, 겹치는 파일이 있는지(`git diff --stat HEAD origin/main`) 확인한 뒤 `git merge origin/main`으로 병합하고 `npx pnpm@11.15.1 check`를 다시 통과시킨 뒤 push한다. 겹치는 파일이 있고 자동 병합이 애매하면 push하지 말고 사용자에게 보고한다.

```bash
git push origin main
```

- [ ] **Step 4: WORKLOG_A.md에 결과 기록**

`WORKLOG_A.md`에 아래 형식으로 새 항목을 맨 아래에 추가한다 (기존 항목 형식과 동일하게 목적/변경/영향 범위/검증/전달/남은 일 구조를 따른다):

```markdown
## 2026-08-25 — e2e 테스트를 예약자명단 흐름으로 재작성

- 목적: [0] 계약 스텁 구현 때 함께 깨졌던 tests/e2e/demo-flow.spec.ts를 새 예약자명단 흐름 기준으로 재작성해 pnpm test:e2e를 다시 통과시킨다
- 변경: 3지선다 관련 테스트 helper·assertion을 예약자명단 폼·리포트 기준으로 교체. "무응답과 긍정 기준 부족" 테스트는 "예약자명단이 비어있거나 채워진 상태" 테스트로 대체
- 영향 범위: tests/e2e/demo-flow.spec.ts
- 검증: pnpm check(lint·typecheck·단위 테스트·build), pnpm test:e2e 13개 전부 통과
- 전달: [실제 커밋 해시로 채운다]
- 남은 일: 없음
```
```

## Self-Review 메모 (Codex가 실행 전 참고)

- 이 플랜은 `tests/e2e/demo-flow.spec.ts` 한 파일만 수정한다. 프로덕션 코드는 이미 `e56f697`까지 push된 상태로 완성돼 있다.
- Task 2, 6, 8은 실제 API 호출(`fetch`)이 서버에 진짜 요청을 보내므로, 같은 이메일을 여러 테스트에서 재사용하면 `test.beforeEach`의 `DELETE /api/campaigns`가 매번 데모 캠페인을 초기화해주는 것에 의존한다 — 이미 파일 상단(L99-102)에 있는 기존 `beforeEach`를 건드리지 않는다.
- 각 태스크의 "Run" 커맨드는 `-g` 정규식이 테스트 이름 일부와 일치하면 되므로, 정확한 전체 문자열을 몰라도 고유한 부분 문자열이면 충분하다.
