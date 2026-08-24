# Figma 최종 디자인 반영 및 용어 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자이너의 최신 Figma(`유니톤`)를 반영해 화면 문구를 "프로젝트"로 통일하고, 대시보드 카드 비주얼과 리포트 화면(광고 지표·퍼널·예약자 리스트)을 Figma 방향에 맞춰 다시 구성한다.

**Architecture:** 기존 `CampaignSpec`/`CampaignRepository` 계약을 전부 **추가적(additive)**으로만 확장한다 — 새 선택적 필드(`demoMetrics`)와 새 메서드(`recordReservationEmail`/`listReservationEmails`)를 더할 뿐, 기존 필드·메서드·라우트는 시그니처를 바꾸지 않는다. 사용자 화면 문구는 "프로젝트"로 통일하되 타입명·라우트·파일명(`Campaign*`, `/campaigns/[id]`)은 그대로 둔다. 광고 지표는 전부 fixture에 박아넣은 고정 데모 값이며 실제 추적 인프라는 만들지 않는다.

**Tech Stack:** Next.js App Router, TypeScript(strict), Zod 4, Vitest 4(node 환경), Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-25-figma-final-design-and-terminology-alignment-design.md`

## Global Constraints

- 패키지 매니저 `pnpm`. 커밋 전 `pnpm check`(`lint`+`typecheck`+`test`) 통과가 원칙(CONTRIBUTING.md).
- 모든 계약 변경은 추가적이어야 한다 — 기존 메서드 시그니처·필드를 바꾸지 않는다(스펙 §3.1, §3.2).
- 코드 심볼(`CampaignSpec`, `CampaignRepository`, 파일명, 라우트 `/campaigns/[id]`)은 리네이밍하지 않는다 — 화면 문구만 "프로젝트"로 바꾼다(스펙 §3.3).
- 광고 지표는 AI가 생성하지 않는다 — `decisionRule`과 같은 성격의 시스템 고정값으로 fixture에 직접 작성한다(스펙 §3.1).
- 이메일은 실제로 발송하지 않는다 — 서버 프로세스 메모리에 수집·표시만 한다(스펙 §3.2).
- Vitest 환경은 `node`(jsdom 아님) — `window` 접근 코드는 유닛 테스트 대상에서 제외하고 e2e(Playwright)로 검증한다.
- 이번 범위는 `lib/contracts/`, `lib/demo/`, `app/api/`처럼 개발자 B 소유 영역과 겹친다 — Task 1 시작 전 `git fetch origin main`으로 최신 상태를 다시 확인한다(스펙 §8).

---

## Task 1: 화면 문구 "프로젝트" 용어 통일 + 진행상황 페이지 카피 갱신 [공유 문구, 코드 심볼 변경 없음]

**배경:** 대시보드는 이미 "프로젝트"를 쓰는데 나머지 화면은 "캠페인"을 쓴다. Figma 방향에 맞춰 사용자에게 보이는 문구만 "프로젝트"로 통일한다. 타입명·라우트는 바꾸지 않는다.

**Files:**
- Modify: `components/site-header.tsx:13`
- Modify: `app/page.tsx` (CTA 문구만, 카드 비주얼은 Task 2에서)
- Modify: `components/campaign-wizard.tsx:96,132`
- Modify: `components/campaign-report.tsx:218,268`
- Modify: `components/progress-view.tsx:20,36-37`
- Modify: `tests/e2e/demo-flow.spec.ts:40,43,212,217`

- [ ] **Step 1: 시작 전 `origin/main` 재확인**

Run: `git fetch origin main && git log --oneline -3 origin/main`
Expected: `9e593d2 docs: 최종 종단 검증 결과를 기록`가 최상단. 다른 커밋이 보이면 작업을 멈추고 사람에게 보고한다.

- [ ] **Step 2: `components/site-header.tsx:13` 수정**

```tsx
          <Link href="/new">프로젝트 만들기</Link>
```

- [ ] **Step 3: `app/page.tsx`의 CTA 문구 수정**

`<Link className="button button-primary" href="/new"><PlusIcon size={18} /> 새 캠페인</Link>`를:

```tsx
          <Link className="button button-primary" href="/new"><PlusIcon size={18} /> 새 프로젝트</Link>
```

- [ ] **Step 4: `components/campaign-wizard.tsx` 문구 수정**

Line 96(`setError("캠페인 생성에 실패했어요. 다시 시도해주세요.");`)를:
```tsx
      setError("프로젝트 생성에 실패했어요. 다시 시도해주세요.");
```

Line 132(버튼 라벨)를:
```tsx
            {step === 1 ? <>다음 <ArrowRightIcon size={17} /></> : submitting ? "만드는 중..." : <>프로젝트 만들기 <ArrowRightIcon size={17} /></>}
```

- [ ] **Step 5: `components/campaign-report.tsx` 문구 수정**

Line 218(eyebrow)를:
```tsx
        <div><span className="eyebrow">{spec.project.name} · 데모 프로젝트</span><h1>검증 리포트를 보여드릴게요</h1><p>모든 수치는 발표 흐름을 확인하기 위한 목데이터입니다.</p></div>
```

Line 268(하단 링크)를:
```tsx
      <div className="report-footer-actions"><button className="text-button danger" type="button" onClick={reset} disabled={resetting || pendingAction !== null}>{resetting ? "초기화 중..." : "데모 데이터 초기화"}</button><Link className="button button-secondary" href="/new">새 프로젝트 만들기</Link></div>
```

- [ ] **Step 6: `components/progress-view.tsx` 헤드라인·서브헤드 수정**

Line 20을:
```tsx
        <div><span className="eyebrow">DETERMINISTIC DEMO</span><h1>광고 검증을 준비하고 있습니다</h1></div>
```

Line 36-37을:
```tsx
        <h2>{current === 3 ? "랜딩·캐러셀·게시 준비가 끝났어요" : "검토한 내용을 바탕으로 광고 소재와 랜딩페이지를 제작하고 있습니다"}</h2>
        <p>{current === 3 ? "실제 외부 API 없이 동일한 fixture와 렌더러로 완성했습니다." : "잠시만 기다려주세요. 이 화면은 발표용 결정적 시뮬레이션입니다."}</p>
```

(ETA 배지 `약 2분`/`완료`와 스테퍼 라벨은 변경하지 않는다 — 이미 확정된 동작이다.)

- [ ] **Step 7: `tests/e2e/demo-flow.spec.ts`의 이름 변경된 로케이터 수정**

Line 40을: `await page.getByRole("link", { name: "새 프로젝트" }).click();`

Line 43을: `await page.getByRole("button", { name: /프로젝트 만들기/ }).click();`

Line 212을: `await page.getByRole("button", { name: /프로젝트 만들기/ }).click();`

Line 217을: `await page.getByRole("button", { name: /프로젝트 만들기/ }).click();`

- [ ] **Step 8: 타입/린트/빌드 확인**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
Expected: PASS

- [ ] **Step 9: e2e 회귀 확인**

Run: `corepack pnpm exec playwright test demo-flow` (별도 dev 서버 필요 — `corepack pnpm dev`를 백그라운드로 띄운 뒤 실행)
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add components/site-header.tsx app/page.tsx components/campaign-wizard.tsx components/campaign-report.tsx components/progress-view.tsx tests/e2e/demo-flow.spec.ts
git commit -m "feat: 화면 문구를 프로젝트로 통일하고 진행상황 카피를 Figma에 맞춘다"
```

---

## Task 2: 대시보드 카드 비주얼을 Figma 스타일로 교체 [시각 전용, 계약 변경 없음]

**배경:** Figma 카드는 문서→화살표→이미지 아이콘(sparkle 포함) 조합을 쓴다. 현재는 추상적인 `visual-orb`/`visual-copy` 블록이다. 카드 콘텐츠(프로젝트명, 상태, 진행률)는 그대로 두고 비주얼만 바꾼다.

**Files:**
- Modify: `components/icons.tsx` (아이콘 추가)
- Modify: `app/page.tsx` (카드 비주얼 마크업)
- Modify: `app/globals.css` (`.project-visual` 관련 스타일)

- [ ] **Step 1: `components/icons.tsx`에 카드 플로우 아이콘 추가**

파일 끝에 추가:

```tsx
export function CardFlowIcon(props: IconProps) {
  const size = props.size ?? 20;
  return (
    <svg className={props.className} width={size * 2.3} height={size} viewBox="0 0 62 24" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 8h8M5 12h8M5 16h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M22 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m28 8 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="38" y="2" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="45" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m41 18 5-5 4 3 4-5 3 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 3v3M54.5 4.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: `app/page.tsx`의 카드 비주얼 블록 교체**

`<div className={\`project-visual ${project.tone}\`}>...</div>` 내부(`visual-pill` 다음, `visual-orb` 포함 전체)를:

```tsx
              <div className={`project-visual ${project.tone}`}>
                <span className="visual-pill">{project.state}</span>
                <div className="visual-flow"><CardFlowIcon size={22} /></div>
              </div>
```

파일 상단 import에 `CardFlowIcon` 추가:
```tsx
import { CardFlowIcon, PlusIcon } from "@/components/icons";
```

(`visual-copy`/`visual-orb` JSX와 `index === 0 ? ... : ...` 조건부 문구는 제거한다 — Figma 카드는 프로젝트별 문구 대신 아이콘만 보여준다.)

- [ ] **Step 3: `app/globals.css`에서 `.visual-copy`/`.visual-orb` 규칙을 `.visual-flow`로 교체**

기존 `.visual-pill` 규칙 뒤(현재 `.visual-orb` 규칙이 있던 자리)에 아래로 교체:

```css
.visual-flow { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; height: 100%; color: var(--purple-dark); opacity: .85; }
```

(`.visual-copy`, `.visual-orb` 규칙은 삭제한다 — 더 이상 쓰이지 않는다.)

- [ ] **Step 4: 타입/린트/빌드 확인**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `corepack pnpm dev`, `http://localhost:3000/`에서 카드 비주얼이 아이콘으로 보이는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add components/icons.tsx app/page.tsx app/globals.css
git commit -m "feat: 대시보드 카드 비주얼을 Figma 아이콘 스타일로 교체"
```

---

## Task 3: `CampaignSpec`에 데모 광고 지표 스키마 추가 [계약, 추가적]

**Files:**
- Modify: `lib/contracts/campaign.ts`
- Test: `tests/unit/campaign.test.ts`

**Interfaces:**
- Produces: `campaignDemoMetricsSchema`, `CampaignDemoMetrics` 타입. `CampaignSpec.demoMetrics?: CampaignDemoMetrics`(선택적 — 없으면 리포트가 광고 지표 섹션을 렌더링하지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/campaign.test.ts` 끝에 추가:

```ts
  it("accepts a spec with optional demo metrics attached", () => {
    const specWithMetrics = structuredClone(demoCampaign);
    specWithMetrics.demoMetrics = {
      impressions: 1_800_820,
      clicks: 226_903,
      landingVisits: 4_331,
      reservations: 65,
      ctr: 0.126,
      reservationRate: 0.015,
      industryBenchmark: { ctr: 0.021, reservationRate: 0.023 },
    };

    expect(() => campaignSpecSchema.parse(specWithMetrics)).not.toThrow();
  });

  it("rejects a demo metrics rate outside 0 to 1", () => {
    const invalidSpec = structuredClone(demoCampaign);
    invalidSpec.demoMetrics = {
      impressions: 100,
      clicks: 10,
      landingVisits: 5,
      reservations: 1,
      ctr: 1.5,
      reservationRate: 0.01,
      industryBenchmark: { ctr: 0.02, reservationRate: 0.02 },
    };

    expect(() => campaignSpecSchema.parse(invalidSpec)).toThrow();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- campaign.test`
Expected: FAIL — `demoCampaign`(fixture)에 `demoMetrics`가 없어서 `structuredClone` 자체는 되지만, `campaignSpecSchema`가 `demoMetrics` 필드를 모르는 상태라 첫 번째 신규 테스트가 "설정했는데 strict 스키마가 알 수 없는 키로 거절"하며 실패해야 한다. 두 번째 테스트는 아직 스키마가 `demoMetrics`를 검증하지 않으므로 조용히 통과할 수 있다 — 그 경우 `expect(...).not.toThrow()` 케이스가 반대로 실패하는지 확인하고, 스키마가 없다는 걸 확실히 하려면 우선 첫 번째 테스트만으로 RED를 확인한다.

- [ ] **Step 3: 스키마 구현**

`lib/contracts/campaign.ts`에서 `carouselContentSchema` 선언 뒤(`campaignSpecSchema` 선언 전)에 추가:

```ts
export const campaignDemoMetricsSchema = z.object({
  impressions: z.number().int().min(0),
  clicks: z.number().int().min(0),
  landingVisits: z.number().int().min(0),
  reservations: z.number().int().min(0),
  ctr: z.number().min(0).max(1),
  reservationRate: z.number().min(0).max(1),
  industryBenchmark: z.object({
    ctr: z.number().min(0).max(1),
    reservationRate: z.number().min(0).max(1),
  }).strict(),
}).strict();

export type CampaignDemoMetrics = z.infer<typeof campaignDemoMetricsSchema>;
```

`campaignSpecSchema`의 최상위 객체(`safety: z.object({...}).strict(),` 다음 줄, `}).strict();`로 닫히기 직전)에 필드 추가:

```ts
  safety: z.object({
    claimsToReview: z.array(shortText(240)).max(8),
    prohibitedClaimsRemoved: z.array(shortText(240)).max(8),
  }).strict(),
  demoMetrics: campaignDemoMetricsSchema.optional(),
}).strict();
```

- [ ] **Step 4: 통과 확인**

Run: `corepack pnpm test -- campaign.test`
Expected: PASS (6개 테스트 전부)

- [ ] **Step 5: 타입 체크**

Run: `corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/contracts/campaign.ts tests/unit/campaign.test.ts
git commit -m "feat: CampaignSpec에 선택적 데모 광고 지표 스키마 추가"
```

---

## Task 4: 데모 캠페인 3종에 고정 지표 값 채우기 [fixture 데이터]

**배경:** Task 3에서 만든 `demoMetrics`는 AI가 생성하지 않는 시스템 고정값이다. `decisionRule`처럼 fixture 파일에 직접 작성한다.

**Files:**
- Modify: `lib/demo/demo-campaign.ts`

**Interfaces:**
- Consumes: `campaignDemoMetricsSchema`(Task 3, 검증만 — `defineCampaign`이 이미 `campaignSpecSchema.parse`를 호출하므로 자동 검증됨)

- [ ] **Step 1: `demoCampaign`에 `demoMetrics` 추가**

`demoCampaign` 객체 리터럴의 `safety: {...},` 다음(객체를 닫는 `});` 앞)에 추가:

```ts
  demoMetrics: {
    impressions: 1_800_820,
    clicks: 226_903,
    landingVisits: 4_331,
    reservations: 65,
    ctr: 0.126,
    reservationRate: 0.015,
    industryBenchmark: { ctr: 0.021, reservationRate: 0.023 },
  },
```

- [ ] **Step 2: `workshopVacancyCampaign`에 `demoMetrics` 추가**

같은 위치에:

```ts
  demoMetrics: {
    impressions: 942_310,
    clicks: 101_169,
    landingVisits: 2_218,
    reservations: 41,
    ctr: 0.107,
    reservationRate: 0.018,
    industryBenchmark: { ctr: 0.021, reservationRate: 0.023 },
  },
```

- [ ] **Step 3: `classInquiryCampaign`에 `demoMetrics` 추가**

같은 위치에:

```ts
  demoMetrics: {
    impressions: 611_540,
    clicks: 88_113,
    landingVisits: 1_845,
    reservations: 33,
    ctr: 0.144,
    reservationRate: 0.018,
    industryBenchmark: { ctr: 0.021, reservationRate: 0.023 },
  },
```

- [ ] **Step 4: 회귀 테스트**

Run: `corepack pnpm test`
Expected: PASS. `tests/unit/campaign.test.ts`의 `"accepts the complete deterministic demo fixture"`가 `campaignSpecSchema.parse(demoCampaign)`을 `toEqual(demoCampaign)`으로 비교하므로, `demoMetrics`가 스키마와 fixture 양쪽에 일관되게 있어야 계속 통과한다.

- [ ] **Step 5: 타입 체크**

Run: `corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/demo/demo-campaign.ts
git commit -m "feat: 데모 캠페인 3종에 고정 광고 지표 값 추가"
```

---

## Task 5: `CampaignRepository`에 예약자 이메일 수집·조회 계약과 fixture 구현 추가 [계약+구현, 추가적]

**Files:**
- Modify: `lib/contracts/repository.ts`
- Modify: `lib/demo/fixtureRepository.ts`
- Test: `tests/unit/fixtureRepository.test.ts`

**Interfaces:**
- Produces: `RecordReservationInput` 타입; `CampaignRepository.recordReservationEmail(input): Promise<void>`; `CampaignRepository.listReservationEmails(campaignId): Promise<readonly string[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/fixtureRepository.test.ts`의 `describe("FixtureCampaignRepository", ...)` 블록 안, 마지막 `it(...)` 뒤에 추가:

```ts
  it("이메일을 남기면 예약자 리스트에 순서대로 쌓이고, 게시되지 않은 캠페인은 조회에 실패한다", async () => {
    const repository = new FixtureCampaignRepository();

    await expect(repository.listReservationEmails(demoCampaignId)).resolves.toEqual([]);

    await repository.recordReservationEmail({ campaignId: demoCampaignId, email: "a@example.com" });
    await repository.recordReservationEmail({ campaignId: demoCampaignId, email: "b@example.com" });

    await expect(repository.listReservationEmails(demoCampaignId)).resolves.toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    await expect(repository.listReservationEmails("no-such-campaign")).rejects.toThrow();
  });

  it("초기화하면 예약자 리스트도 함께 비워진다", async () => {
    const repository = new FixtureCampaignRepository();
    await repository.recordReservationEmail({ campaignId: demoCampaignId, email: "a@example.com" });

    await repository.reset({ campaignId: demoCampaignId, draftId: demoCampaignId });

    await expect(repository.listReservationEmails(demoCampaignId)).resolves.toEqual([]);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- fixtureRepository`
Expected: FAIL — `repository.recordReservationEmail is not a function`

- [ ] **Step 3: `lib/contracts/repository.ts`에 타입·인터페이스 메서드 추가**

`SignalInput` 타입 선언 뒤에 추가:

```ts
export type RecordReservationInput = {
  campaignId: string;
  email: string;
};
```

`CampaignRepository` 인터페이스에 메서드 추가(기존 메서드는 그대로 두고 끝에 추가):

```ts
export interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getById(id: string): Promise<PublishedCampaign | null>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordSignal(input: SignalInput): Promise<SignalSummary>;
  getSignalSummary(campaignId: string): Promise<SignalSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
  reset(input: ResetCampaignInput): Promise<PublishedCampaign>;
  delete(input: DeleteCampaignInput): Promise<void>;
  recordReservationEmail(input: RecordReservationInput): Promise<void>;
  listReservationEmails(campaignId: string): Promise<readonly string[]>;
}
```

- [ ] **Step 4: `lib/demo/fixtureRepository.ts` 구현**

Import 블록에 `RecordReservationInput` 추가:

```ts
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
  InvalidSignalOptionError,
  type CampaignRepository,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type RecordReservationInput,
  type ResetCampaignInput,
  type SignalInput,
  type SignalSummary,
} from "@/lib/contracts/repository";
```

클래스 필드 선언(`private readonly signals = ...` 다음 줄)에 추가:

```ts
  private readonly reservationEmails = new Map<string, string[]>();
```

`insertCampaign` 메서드 안, `this.signals.set(campaign.id, this.createSeedSignalMap());` 다음 줄에 추가:

```ts
    this.reservationEmails.set(campaign.id, []);
```

`removeCampaign` 메서드 안, `this.signals.delete(campaign.id);` 다음 줄에 추가:

```ts
    this.reservationEmails.delete(campaign.id);
```

`reset` 메서드 안, `this.signals.set(campaign.id, this.createSeedSignalMap());` 다음 줄에 추가:

```ts
    this.reservationEmails.set(campaign.id, []);
```

클래스에 새 public 메서드 추가(`async delete(...)` 메서드 뒤, `reset(...)` 메서드 앞):

```ts
  async recordReservationEmail(input: RecordReservationInput): Promise<void> {
    const campaign = this.requireCampaign(input.campaignId);
    const emails = this.reservationEmails.get(campaign.id) ?? [];
    emails.push(input.email.trim());
    this.reservationEmails.set(campaign.id, emails);
  }

  async listReservationEmails(campaignId: string): Promise<readonly string[]> {
    this.requireCampaign(campaignId);
    return [...(this.reservationEmails.get(campaignId) ?? [])];
  }
```

- [ ] **Step 5: 통과 확인**

Run: `corepack pnpm test -- fixtureRepository`
Expected: PASS (기존 5개 + 신규 2개 = 7개)

- [ ] **Step 6: 타입 체크**

Run: `corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/contracts/repository.ts lib/demo/fixtureRepository.ts tests/unit/fixtureRepository.test.ts
git commit -m "feat: FixtureCampaignRepository에 예약자 이메일 수집·조회 추가"
```

---

## Task 6: API 계약과 라우트에 예약 이메일 반영 [추가적]

**Files:**
- Modify: `lib/contracts/api.ts`
- Modify: `app/api/_lib/campaign-response.ts`
- Create: `app/api/campaigns/reservations/route.ts`
- Test: `tests/unit/api-reservations.test.ts`

**Interfaces:**
- Consumes: `CampaignRepository.recordReservationEmail`/`listReservationEmails`(Task 5)
- Produces: `recordReservationRequestSchema`, `RecordReservationRequest` 타입; `CampaignResponse.reservationEmails: readonly string[]`(추가 필드); `POST /api/campaigns/reservations` — 요청 `{ campaignId, email }` → 성공 `{ recorded: true }`(201)

- [ ] **Step 1: `lib/contracts/api.ts`에 스키마·타입 추가**

`recordSignalRequestSchema` 선언 뒤에 추가:

```ts
export const recordReservationRequestSchema = z.object({
  campaignId: identifierSchema,
  email: z.string().trim().email().max(200),
}).strict();

export type RecordReservationRequest = z.infer<typeof recordReservationRequestSchema>;
```

`CampaignResponse` 타입을 아래로 교체:

```ts
export type CampaignResponse = PublishedCampaign & {
  url: string;
  summary: SignalSummary;
  reservationEmails: readonly string[];
};
```

- [ ] **Step 2: `app/api/_lib/campaign-response.ts` 수정**

전체를 아래로 교체:

```ts
import type { CampaignResponse } from "@/lib/contracts/api";
import type { PublishedCampaign } from "@/lib/contracts/repository";
import { campaignRepository } from "@/lib/demo/repository";

export async function toCampaignResponse(
  campaign: PublishedCampaign,
  requestUrl: string,
): Promise<CampaignResponse> {
  return {
    ...campaign,
    url: new URL(`/p/${campaign.slug}`, requestUrl).toString(),
    summary: await campaignRepository.getSignalSummary(campaign.id),
    reservationEmails: await campaignRepository.listReservationEmails(campaign.id),
  };
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/unit/api-reservations.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/campaigns/reservations/route";
import { GET } from "@/app/api/campaigns/route";
import { demoCampaignId } from "@/lib/demo/demo-campaign";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/campaigns/reservations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/campaigns/reservations", () => {
  it("이메일을 기록하고, 리포트 조회에 예약자 리스트로 반영한다", async () => {
    const response = await POST(jsonRequest({ campaignId: demoCampaignId, email: "reserve@example.com" }));
    expect(response.status).toBe(201);

    const getResponse = await GET(new Request(`http://localhost/api/campaigns?id=${demoCampaignId}`));
    const body = await getResponse.json();
    expect(body.reservationEmails).toContain("reserve@example.com");
  });

  it("이메일 형식이 아니면 거절한다", async () => {
    const response = await POST(jsonRequest({ campaignId: demoCampaignId, email: "not-an-email" }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `corepack pnpm test -- api-reservations`
Expected: FAIL — `app/api/campaigns/reservations/route.ts` 없음

- [ ] **Step 5: 라우트 구현**

`app/api/campaigns/reservations/route.ts`:

```ts
import { recordReservationRequestSchema } from "@/lib/contracts/api";
import { campaignRepository } from "@/lib/demo/repository";
import { jsonResponse, readJsonBody, routeErrorResponse } from "@/app/api/_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = recordReservationRequestSchema.parse(await readJsonBody(request, 2_048));
    await campaignRepository.recordReservationEmail(input);
    return jsonResponse({ recorded: true }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
```

- [ ] **Step 6: 통과 확인**

Run: `corepack pnpm test -- api-reservations`
Expected: PASS

- [ ] **Step 7: 전체 유닛 회귀 + 타입 체크**

Run: `corepack pnpm test && corepack pnpm typecheck`
Expected: PASS 전부(기존 `api-campaigns` 계열 테스트가 `CampaignResponse`에 새 필드가 생겨도 깨지지 않는지 확인 — 필드 추가라 기존 `toMatchObject`/`toHaveProperty` 스타일 단언은 영향 없어야 한다. 만약 `toEqual`로 전체 객체를 비교하는 기존 테스트가 있다면 `reservationEmails: []`를 기대값에 추가한다.)

- [ ] **Step 8: 커밋**

```bash
git add lib/contracts/api.ts app/api/_lib/campaign-response.ts app/api/campaigns/reservations/route.ts tests/unit/api-reservations.test.ts
git commit -m "feat: 예약자 이메일 기록 라우트와 리포트 응답 필드 추가"
```

---

## Task 7: `PublicLanding`에 선택적 이메일 남기기 단계 추가

**배경:** 기존 3지선다 익명 응답은 그대로 둔다("이름, 이메일, 전화번호는 받지 않습니다" 문구도 유지). 응답 제출에 성공한 뒤(`submitted` 상태) 별도로, 원하면 이메일을 남길 수 있는 선택적 단계를 추가한다.

**Files:**
- Modify: `components/renderers/public-landing.tsx`
- Modify: `app/globals.css` (새 클래스)

**Interfaces:**
- Consumes: `POST /api/campaigns/reservations`(Task 6)

- [ ] **Step 1: `components/renderers/public-landing.tsx` state 추가**

`const [error, setError] = useState("");` 다음 줄에 추가:

```tsx
  const [reservationEmail, setReservationEmail] = useState("");
  const [reservationSubmitted, setReservationSubmitted] = useState(false);
  const [reservationSubmitting, setReservationSubmitting] = useState(false);
  const [reservationError, setReservationError] = useState("");
```

`async function submit() {...}` 함수 뒤에 함수 추가:

```tsx
  async function submitReservationEmail() {
    if (reservationSubmitting || !reservationEmail.trim()) return;
    setReservationSubmitting(true);
    setReservationError("");
    try {
      const response = await fetch("/api/campaigns/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, email: reservationEmail.trim() }),
      });
      if (!response.ok) throw new Error("reservation_request_failed");
      setReservationSubmitted(true);
    } catch {
      setReservationError("이메일을 남기지 못했어요. 다시 시도해주세요.");
    } finally {
      setReservationSubmitting(false);
    }
  }
```

- [ ] **Step 2: 성공 화면(`submitted` 분기)에 선택적 이메일 폼 추가**

```tsx
            {submitted ? (
              <div className="signal-success">
                <span><CheckIcon size={28} /></span>
                <h3>응답이 기록됐어요</h3>
                <p>{spec.validation.signal.successMessage}</p>
                <a href={reportPath}>데모 리포트에서 확인하기</a>
                <div className="reservation-optin">
                  {reservationSubmitted ? (
                    <p className="reservation-optin-success"><CheckIcon size={16} /> 이메일을 남겼어요. 감사합니다!</p>
                  ) : (
                    <>
                      <p>다음 소식을 받고 싶다면 이메일을 남겨주세요 (선택).</p>
                      <div className="reservation-optin-form">
                        <input
                          type="email"
                          value={reservationEmail}
                          onChange={(event) => setReservationEmail(event.target.value)}
                          placeholder="you@example.com"
                          aria-label="이메일"
                        />
                        <button type="button" onClick={submitReservationEmail} disabled={reservationSubmitting || !reservationEmail.trim()}>
                          {reservationSubmitting ? "저장 중..." : "남기기"}
                        </button>
                      </div>
                      {reservationError && <p className="signal-error" role="alert">{reservationError}</p>}
                    </>
                  )}
                </div>
              </div>
            ) : duplicate ? (
```

(`) : duplicate ? (` 이후 기존 코드는 그대로 둔다 — `submitted ? (...) : duplicate ? (...) : (...)` 3항 구조에서 첫 번째 분기만 교체한다.)

- [ ] **Step 3: `app/globals.css`에 스타일 추가**

`.signal-success` 관련 규칙 근처에 추가(파일 끝에 추가해도 무방):

```css
.reservation-optin { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.reservation-optin > p { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
.reservation-optin-form { display: flex; gap: 8px; }
.reservation-optin-form input { flex: 1; min-height: 40px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 14px; }
.reservation-optin-form button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: var(--purple); color: white; font-weight: 700; cursor: pointer; }
.reservation-optin-success { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--purple-dark); font-size: 13px; font-weight: 700; }
```

- [ ] **Step 4: 타입/린트/빌드 확인**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/renderers/public-landing.tsx app/globals.css
git commit -m "feat: 공개 랜딩 응답 성공 화면에 선택적 이메일 남기기 추가"
```

---

## Task 8: `CampaignReport`에 광고 지표·퍼널·예약자 리스트 섹션 추가 [Figma 레이아웃]

**배경:** 기존 `.metric-grid`(선택형 응답/긍정 신호율/판단 기준까지)와 `응답 분포` 섹션은 그대로 둔다 — 우리 제품의 핵심 신호이자 기존 e2e가 이미 검증하고 있다. 그 사이에 새 섹션을 추가한다.

**Files:**
- Modify: `components/campaign-report.tsx`
- Modify: `app/campaigns/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `spec.demoMetrics`(Task 4, 선택적), `CampaignRepository.listReservationEmails`(Task 5), `CampaignResponse.reservationEmails`(Task 6)

- [ ] **Step 1: `app/campaigns/[id]/page.tsx`에서 예약자 리스트를 함께 조회해 전달**

전체를 아래로 교체:

```tsx
import { notFound } from "next/navigation";
import { CampaignReport } from "@/components/campaign-report";
import { SiteHeader } from "@/components/site-header";
import { campaignRepository } from "@/lib/demo/repository";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const published = await campaignRepository.getById(id);
  if (!published) notFound();
  const initialSummary = await campaignRepository.getSignalSummary(published.id);
  const initialReservationEmails = await campaignRepository.listReservationEmails(published.id);

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CampaignReport
        campaignId={published.id}
        publicSlug={published.slug}
        initialSpec={published.spec}
        initialSummary={initialSummary}
        initialNextAction={published.nextAction}
        initialReservationEmails={initialReservationEmails}
      />
    </div>
  );
}
```

- [ ] **Step 2: `components/campaign-report.tsx`에 props와 state 추가**

`CampaignReportProps` 타입에 필드 추가:

```ts
type CampaignReportProps = {
  campaignId: string;
  publicSlug: string;
  initialSpec: CampaignSpec;
  initialSummary: SignalSummary;
  initialNextAction: NextAction | null;
  initialReservationEmails: readonly string[];
};
```

컴포넌트 시그니처와 state에 추가:

```tsx
export function CampaignReport({
  campaignId,
  publicSlug,
  initialSpec,
  initialSummary,
  initialNextAction,
  initialReservationEmails,
}: CampaignReportProps) {
  const [summary, setSummary] = useState<SignalSummary>(initialSummary);
  const [nextAction, setNextAction] = useState<NextAction | null>(initialNextAction);
  const [reservationEmails, setReservationEmails] = useState<readonly string[]>(initialReservationEmails);
```

`refresh` 콜백 안, `setNextAction(body.nextAction);` 다음 줄에 추가:

```tsx
      setReservationEmails(body.reservationEmails);
```

- [ ] **Step 3: 광고 지표 배지 헬퍼 함수 추가**

`statusCopy` 함수 뒤에 추가:

```ts
function benchmarkBadge(value: number, benchmark: number): { text: string; tone: "positive" | "negative" } {
  if (benchmark === 0) return { text: "업계 평균 데이터 없음", tone: "positive" };
  const diff = Math.round(((value - benchmark) / benchmark) * 100);
  return diff >= 0
    ? { text: `업계 평균 대비 ${diff}% 높음`, tone: "positive" }
    : { text: `업계 평균 대비 ${Math.abs(diff)}% 낮음`, tone: "negative" };
}
```

- [ ] **Step 4: 광고 지표·퍼널 섹션 JSX 추가**

`<section className="report-section response-section">...</section>` 블록 바로 뒤, `<section className="report-section deliverables-section">` 앞에 추가:

```tsx
      {spec.demoMetrics && (() => {
        const metrics = spec.demoMetrics;
        return (
          <section className="report-section ad-metrics-section">
            <div className="section-heading"><div><span className="eyebrow">AD PERFORMANCE · DEMO DATA</span><h2>광고 성과 지표</h2></div></div>
            <div className="ad-metric-grid">
              <article>
                <span>노출 수</span>
                <strong>{metrics.impressions.toLocaleString("ko-KR")}<small>회</small></strong>
              </article>
              <article>
                <span>CTR</span>
                <strong>{(metrics.ctr * 100).toFixed(1)}<small>%</small></strong>
                <b className={`benchmark-badge ${benchmarkBadge(metrics.ctr, metrics.industryBenchmark.ctr).tone}`}>
                  {benchmarkBadge(metrics.ctr, metrics.industryBenchmark.ctr).text}
                </b>
              </article>
              <article>
                <span>예약률</span>
                <strong>{(metrics.reservationRate * 100).toFixed(1)}<small>%</small></strong>
                <b className={`benchmark-badge ${benchmarkBadge(metrics.reservationRate, metrics.industryBenchmark.reservationRate).tone}`}>
                  {benchmarkBadge(metrics.reservationRate, metrics.industryBenchmark.reservationRate).text}
                </b>
              </article>
            </div>
            <div className="funnel-chart" aria-label="유입 분석">
              {[
                { label: "노출", value: metrics.impressions },
                { label: "클릭", value: metrics.clicks },
                { label: "랜딩 방문", value: metrics.landingVisits },
                { label: "예약", value: metrics.reservations },
              ].map((step) => (
                <div className="funnel-step" key={step.label}>
                  <div className="funnel-bar" style={{ height: `${Math.max(6, (step.value / metrics.impressions) * 100)}%` }} />
                  <b>{step.value.toLocaleString("ko-KR")}</b>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
            <p className="data-note">이 지표는 실제 광고 계정과 연결되지 않은 데모 데이터입니다.</p>
          </section>
        );
      })()}

      <section className="report-section reservation-section">
        <div className="section-heading"><div><span className="eyebrow">RESERVATION LIST</span><h2>예약자 리스트</h2></div></div>
        {reservationEmails.length === 0 ? (
          <p className="data-note">아직 남겨진 이메일이 없어요.</p>
        ) : (
          <table className="reservation-table">
            <thead><tr><th>No</th><th>이메일</th></tr></thead>
            <tbody>
              {reservationEmails.map((email, index) => <tr key={`${email}-${index}`}><td>{index + 1}</td><td>{email}</td></tr>)}
            </tbody>
          </table>
        )}
      </section>
```

- [ ] **Step 5: `app/globals.css`에 새 섹션 스타일 추가**

파일 끝에 추가:

```css
.ad-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 18px 0; }
.ad-metric-grid article { padding: 22px; border-radius: 16px; background: var(--surface); }
.ad-metric-grid article > span { color: var(--muted); font-size: 12px; }
.ad-metric-grid strong { display: block; margin: 8px 0 8px; color: var(--purple-dark); font-size: 30px; line-height: 1; }
.ad-metric-grid strong small { padding-left: 3px; font-size: 13px; }
.benchmark-badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.benchmark-badge.positive { background: #e3f7f0; color: #0f6d4c; }
.benchmark-badge.negative { background: #fdeceb; color: #b3261e; }
.funnel-chart { display: grid; grid-template-columns: repeat(4, 1fr); align-items: end; gap: 14px; height: 160px; margin-top: 8px; padding: 16px; border-radius: 16px; background: var(--surface); }
.funnel-step { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 6px; }
.funnel-bar { width: 34px; min-height: 6px; border-radius: 6px 6px 0 0; background: var(--purple); }
.funnel-step b { font-size: 13px; }
.funnel-step span { color: var(--muted); font-size: 11px; }
.reservation-table { width: 100%; border-collapse: collapse; }
.reservation-table th, .reservation-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.reservation-table th { color: var(--muted); font-weight: 700; }
```

- [ ] **Step 6: 타입/린트/빌드 확인**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
Expected: PASS

- [ ] **Step 7: 수동 확인**

Run: `corepack pnpm dev`, `/campaigns/demo`에서 광고 성과 지표·퍼널·예약자 리스트 섹션이 보이는지 확인. `/p/demo`에서 응답 후 이메일을 남기고 `/campaigns/demo`로 돌아와 예약자 리스트에 반영되는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add components/campaign-report.tsx app/campaigns/[id]/page.tsx app/globals.css
git commit -m "feat: 리포트 화면에 광고 지표·퍼널·예약자 리스트 섹션 추가"
```

---

## Task 9: e2e로 이메일 수집 → 예약자 리스트 반영 흐름 검증

**Files:**
- Create: `tests/e2e/reservation-flow.spec.ts`

- [ ] **Step 1: 테스트 작성**

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.delete("/api/campaigns");
  expect(response.ok()).toBe(true);
});

test("공개 랜딩에서 남긴 이메일이 리포트의 예약자 리스트에 나타난다", async ({ page }) => {
  await page.goto("/p/demo");
  await page.getByRole("button", { name: "네, 써보고 싶어요" }).click();
  await page.getByRole("button", { name: "익명으로 응답하기" }).click();
  await expect(page.getByRole("heading", { name: "응답이 기록됐어요" })).toBeVisible();

  await page.getByLabel("이메일").fill("demo-visitor@example.com");
  await page.getByRole("button", { name: "남기기" }).click();
  await expect(page.getByText("이메일을 남겼어요. 감사합니다!")).toBeVisible();

  await page.goto("/campaigns/demo");
  await expect(page.locator(".reservation-table")).toContainText("demo-visitor@example.com");
});

test("광고 성과 지표 섹션이 데모 지표 값을 보여준다", async ({ page }) => {
  await page.goto("/campaigns/demo");
  await expect(page.locator(".ad-metrics-section")).toContainText("광고 성과 지표");
  await expect(page.locator(".ad-metrics-section")).toContainText("노출 수");
  await expect(page.locator(".funnel-chart")).toContainText("예약");
});
```

- [ ] **Step 2: 실행**

Run: `corepack pnpm exec playwright test reservation-flow`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/reservation-flow.spec.ts
git commit -m "test: 이메일 수집과 광고 지표 리포트 반영을 e2e로 검증"
```

---

## Task 10: 문서 갱신

**Files:**
- Modify: `docs/spec.md`
- Modify: `docs/decisions/0001-close-the-validation-loop.md`
- Modify: `docs/decisions/0006-publish-without-output-review-screens.md`
- Modify: `docs/user-flow-and-wireframes.md`
- Modify: `docs/demo-runbook.md`

- [ ] **Step 1: `docs/spec.md`의 개인정보 미수집 문구 수정**

"P0에서는 이메일, 이름, 전화번호 등 개인정보를 받지 않는다"가 포함된 문장을 찾아(P0-4 섹션) 아래로 교체:

```markdown
P0에서는 이름, 전화번호 등 개인정보를 받지 않는다. 응답 제출 뒤 선택적으로 이메일을 남길 수 있으며, 이메일은 실제 알림 발송 없이 리포트의 예약자 리스트로만 표시된다.
```

- [ ] **Step 2: `docs/decisions/0001-close-the-validation-loop.md`에 후기 추가**

파일 끝에 추가:

```markdown

## 후기 (2026-08-25)

디자이너의 최신 Figma 반영 과정에서 리포트 화면에 선택적 이메일 수집(예약자 리스트)을 다시 도입하기로 했다. 익명 3지선다 응답은 여전히 기본 경로이며 이메일은 응답 뒤 완전히 선택적인 추가 단계다. 상세는 `docs/superpowers/specs/2026-08-25-figma-final-design-and-terminology-alignment-design.md`를 따른다.
```

- [ ] **Step 3: `docs/decisions/0006-publish-without-output-review-screens.md`에 후기 추가**

파일 끝에 추가:

```markdown

## 후기 (2026-08-25)

리포트 화면에 고정 데모 광고 지표(노출 수·CTR·예약률)와 선택적 이메일 수집(예약자 리스트)을 추가했다. 지표는 AI가 생성하지 않는 시스템 고정값이며 실제 Meta 계정과 연결되지 않는다. 상세는 `docs/superpowers/specs/2026-08-25-figma-final-design-and-terminology-alignment-design.md`를 따른다.
```

- [ ] **Step 4: `docs/user-flow-and-wireframes.md`에 이메일 단계 반영**

`### 공개 랜딩` 섹션의 마지막 불릿 뒤에 추가:

```markdown
- 응답 제출 후 선택적으로 이메일을 남길 수 있다(건너뛰기 가능)
```

- [ ] **Step 5: `docs/demo-runbook.md`에 이메일 단계 반영**

"3분 수동 흐름" 목록의 응답 제출 스텝(`공개 페이지 CTA에서 개인정보 없는 선택형 응답을 하나 제출한다` 항목) 다음에 이어지는 스텝 앞에 삽입할 내용을 해당 스텝 문구에 덧붙인다:

```markdown
5. 25초 — 공개 페이지 CTA에서 개인정보 없는 선택형 응답을 하나 제출하고, 원하면 이메일을 선택적으로 남긴다.
```

(기존 5번 스텝 문구를 위 문구로 교체한다.)

- [ ] **Step 6: 잔여 참조 확인**

Run: `grep -rn "이메일, 이름, 전화번호 등 개인정보를 받지 않는다" docs/spec.md`
Expected: 결과 없음(0건, Step 1에서 이미 수정됨)

- [ ] **Step 7: 커밋**

```bash
git add docs/spec.md docs/decisions/0001-close-the-validation-loop.md docs/decisions/0006-publish-without-output-review-screens.md docs/user-flow-and-wireframes.md docs/demo-runbook.md
git commit -m "docs: 이메일 선택적 수집과 광고 지표 도입을 문서에 반영"
```

---

## Task 11: 전체 회귀 검증

- [ ] **Step 1: 전체 자동 검증**

Run: `corepack pnpm check && corepack pnpm build`
Expected: PASS (lint + typecheck + 전체 unit test + build)

- [ ] **Step 2: 전체 e2e**

Run: `corepack pnpm exec playwright test`(dev 서버가 떠 있지 않다면 `corepack pnpm dev`를 백그라운드로 먼저 띄운다)
Expected: 전부 PASS — `demo-flow`, `report-load-state`, `reservation-flow` 포함

- [ ] **Step 3: 수동 확인**

`pnpm dev`로 `/` → `/new`(프로젝트 만들기) → `/campaigns/[id]/progress` → `/campaigns/[id]`(광고 지표·퍼널·예약자 리스트 확인) → `/p/[slug]`(응답 + 이메일 남기기) → `/campaigns/[id]`로 돌아와 반영 확인까지 한 번 더 훑는다. 375px 모바일 폭에서 새 섹션(`.ad-metric-grid`, `.funnel-chart`, `.reservation-table`)이 깨지지 않는지 확인한다.

- [ ] **Step 4: 사용 안 하는 dev 서버 정리**

Run: 수동 확인에 쓴 `pnpm dev` 프로세스를 종료한다(포트 3000 점유 확인 후 종료).
