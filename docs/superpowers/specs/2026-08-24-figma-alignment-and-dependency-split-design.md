# Figma 정합성 및 2인 병렬개발 경계 설계

상태: 설계 확정, 구현 대기
작성일: 2026-08-24

## 1. 배경

Figma(`유니톤` 파일, "플로우차트 & 와이어프레임" + "템플릿" 페이지)와 현재 저장소(문서 + 코드)를 대조한 결과, 두 종류의 문제를 발견했다.

1. **Figma와 구현/문서 사이의 불일치** — 일부는 이미 의도적으로 다르게 간 것이고(§2), 일부는 미확정 상태였다(§3, 사용자와 논의로 확정).
2. **2인 병렬개발을 가로막는 구조적 문제** — `spec.md`가 문서로는 `CampaignGenerator`/`CampaignRepository` 경계를 설명하지만, 실제 코드에는 해당 인터페이스도 `app/api/*` 라우트도 없다. `/p/[slug]`와 `/campaigns/[id]`가 `lib/demo/demo-campaign.ts`의 fixture를 직접 import한다. 개발자 A 소유 화면이 개발자 B 소유 영역(fixture/향후 adapter)에 직접 의존하는 구조라 지금 상태로 두 사람이 동시에 작업을 시작하면 파일이 겹친다(§4).

## 2. Figma 대조 결과 — 이미 확정된 부분 (재논의 불필요)

- **메인 대시보드** (`1.메인페이지`): 프로젝트 카드 그리드, 필터, `+새로 만들기` — `app/page.tsx`와 일치. 변경 없음.
- **온보딩 2단계** (`2-1`/`2-2 온보딩`): 배경 입력 → 솔루션 입력 — `campaign-wizard.tsx` step 1/2와 일치. 변경 없음.
- **리포트 화면의 지표**: Figma `4.리포트 페이지`는 노출 수·CTR·예약률(업계 평균 대비)·예약자 이메일 리스트를 보여주는 실제 Meta 광고 + 이메일 예약 기반 화면이다. `user-flow-and-wireframes.md`에 이미 "개인정보 없는 선택형 응답 계약과 충돌해 사용하지 않았다"고 기록되어 있고 `spec.md`도 "예약률이라는 명칭을 사용하지 않는다"고 명시한다. 현재 `campaign-report.tsx`는 이 결정을 따른다. **변경 없음 — 확인된 의도적 이탈.**

## 3. Figma 대조 결과 — 이번에 확정한 변경

### 3.1 가설 승인 화면 제거

Figma에는 온보딩 2단계 다음 바로 진행상황 화면으로 이어지며, 별도의 "가설 승인"(고객/문제/해결/기대신호/반증조건 검토) 프레임이 없다. 현재 `CampaignWizard`의 3번째 스텝(승인 화면)을 제거하고, 온보딩 2단계 완료 시 바로 캠페인 생성 요청 → 진행상황 페이지로 이동한다.

- `components/campaign-wizard.tsx`에서 `step: 1 | 2 | 3` → `step: 1 | 2`로 축소, 승인 UI(`hypothesis-grid`, `review-note`, `assumption-list`) 제거.
- `CampaignSpec.validation`의 hypothesis 필드 자체는 유지한다 — 승인 게이트만 없앤다. 이 데이터는 리포트 화면 등 다른 곳에서 계속 쓰인다.

### 3.2 진행상황 페이지 — 데모/실제 이원화

Figma(`3.진행 상황 페이지`)는 "결과 제공까지 2일" + **접수 → 준비 중 → 수집 중 → 결과 도착**으로, 실제 응답을 며칠에 걸쳐 수집하는 시나리오다. 현재 코드(`ProgressView`)는 **접수 → 캠페인 준비 → 산출물 생성 → 결과 도착**을 2초 만에 자동 완료시키는 애니메이션이다.

두 트랙을 명시적으로 문서화한다(`docs/architecture.md`에 추가):

- **데모 트랙(이번 구현 대상)**: 라벨을 Figma와 동일하게 접수 → 준비 중 → 수집 중 → 결과 도착으로 바꾸되, 동작은 지금처럼 ~2초 자동 진행 애니메이션으로 유지한다. "수집 중"은 라벨일 뿐 실제 대기가 아니라는 점을 주석/문서로 남긴다.
- **실제 트랙(추후, Supabase 연동 이후)**: 같은 4단계지만 "수집 중"이 실제 다중일 대기 상태가 된다. "결과 제공까지 N일"은 고정값이 아니라 계산된 추정치가 된다. 이번 범위에는 포함하지 않는다.

### 3.3 문서 정합화

- `spec.md` §4(화면 기능 명세)를 실제 구현(`/` = 대시보드, `/new` = 2단계 온보딩, 승인 단계 없음)에 맞춰 재작성.
- `user-flow-and-wireframes.md`의 mermaid 흐름도에서 `가설 승인` 노드 제거, 진행상황 단계 라벨을 §3.2 기준으로 갱신.
- `docs/architecture.md`에 §3.2의 데모/실제 이원화 내용 추가.

## 4. 현재 코드 방향성에 대한 비판적 평가

전반적 방향(단일 `CampaignSpec` 진실 공급원, 화면·PNG export가 같은 렌더러 공유, 개인정보 비수집 원칙, 외부 API 연결 전 fixture부터 완성하는 순서)은 타당하고 유지한다. 다만 다음은 구조적 문제로, 이번 재구성에서 함께 처리한다.

1. **입력이 장식적이다.** `CampaignWizard`가 배경/솔루션 텍스트를 `localStorage["marketvalley:demo-draft"]`에 저장하지만, 이 값을 읽는 코드가 어디에도 없다(grep으로 확인). 진행상황·리포트·랜딩 화면은 사용자가 무엇을 입력했든 항상 고정된 `demoCampaign`을 렌더링한다. 발표에서 정해진 예시만 입력한다면 문제없지만, 이 사실이 문서 어디에도 명시되어 있지 않다. **원인**: 입력을 소비할 `CampaignGenerator`/`/api/generate`가 아직 코드에 없다 — 화면이 생성 로직보다 먼저 만들어졌다. 이번 범위에서는 인터페이스 시그니처(`generate(input: IdeaInput)`)만 입력을 받도록 고정하고, fixture 구현체가 입력을 실제로 반영할지는 **보류된 결정**으로 남긴다(§6).
2. **`NEXT_PUBLIC_DEMO_MODE`/`데모 결과 열기`가 존재하지 않는다.** `spec.md` P0-6이 요구하는 모드 전환 지점이 코드에 없다. 지금은 모든 경로가 데모이므로 드러나지 않지만, 실제 어댑터가 들어오는 순간 전환 지점이 없다는 게 문제가 된다.
3. **`lib/demo/demo-campaign.ts`와 `lib/demo/demoCampaign.ts`가 같은 폴더에서 다른 네이밍 컨벤션으로 공존**한다. 전자는 후자를 re-export하며 `demoIdeaInput`, `seedSignals`, `evaluateDecision`을 추가한다. 두 번째 개발자가 합류하기 전에 정리한다.
4. **`/campaigns/[id]`, `/p/[slug]`가 `id/slug !== "demo"`를 하드코딩**한다. Supabase 연결 전 임시 상태로는 맞지만, 영구적 설계처럼 보이지 않도록 리포지토리 조회로 교체할 지점임을 명시한다.
5. **인터페이스/라우트 부재로 인한 소유권 경계 침범**: §1의 핵심 문제. §5에서 해결.

## 5. 의존성 분리 아키텍처

### 5.1 추가할 인터페이스

`lib/contracts/generator.ts`:
```ts
export interface CampaignGenerator {
  generate(input: IdeaInput): Promise<CampaignSpec>;
}
```

`lib/contracts/repository.ts`:
```ts
export interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordSignal(input: SignalInput): Promise<SignalSummary>;
  getSignalSummary(campaignId: string): Promise<SignalSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
}
```

두 인터페이스는 `spec.md` §6에 이미 정의된 형태를 그대로 코드로 옮긴 것이다.

### 5.2 Fixture 구현체 (이번 범위, 유일한 구현체)

- `lib/demo/fixtureGenerator.ts`: `CampaignGenerator` 구현. 입력을 받지만 항상 `demoCampaign`을 반환(§6 결정 전까지).
- `lib/demo/fixtureRepository.ts`: `CampaignRepository` 구현. 현재 `lib/client/demo-store.ts`의 localStorage 로직을 이 형태로 감싼다.

### 5.3 API 라우트 (fixture 기반, 외부 SDK 호출 없음)

- `POST /api/generate` → `FixtureCampaignGenerator` 호출
- `POST /api/campaigns`, `PATCH /api/campaigns`, `GET /api/campaigns?id=...` → `FixtureCampaignRepository` 호출
- `POST /api/signals` → `FixtureCampaignRepository` 호출

라우트 시그니처와 요청/응답 형태는 `spec.md` §6 "API 경계"를 그대로 따른다.

### 5.4 소비자 변경

- `CampaignWizard`: 승인 제거 후 온보딩 2단계 완료 시 `fetch('/api/generate', ...)` 호출 → 성공 시 `fetch('/api/campaigns', { method: 'POST', ... })`로 게시 → `/campaigns/[id]/progress`로 이동.
- `app/p/[slug]/page.tsx`: `demoCampaign` 직접 import 제거, 서버 컴포넌트에서 리포지토리(현재는 fixture 구현체를 직접 호출하거나 내부 API를 호출) 경유로 spec을 가져온다.
- `app/campaigns/[id]/page.tsx`, `CampaignReport`: 동일하게 리포지토리/API 경유로 전환.

이 변경 이후 개발자 B가 `FixtureCampaignGenerator`/`FixtureCampaignRepository`를 `OpenAICampaignGenerator`/`SupabaseCampaignRepository`로 교체해도 개발자 A 소유 컴포넌트·페이지는 한 줄도 바뀌지 않는다.

## 6. 보류된 결정 (이번 범위 아님, 다음 논의 필요)

- **입력 반영 범위**: fixture 생성기가 사용자가 입력한 배경/솔루션을 얼마나 반영할지 (전혀 반영 안 함 / 일부 필드만 echo / 간단한 템플릿 기반 생성) — 프로덕트 결정이 아직 없어 이번 설계에서 확정하지 않는다. 인터페이스는 입력을 받도록 열어두되, 구현은 현행 유지(무시).
- **`NEXT_PUBLIC_DEMO_MODE`의 정확한 분기 방식**: 실제 OpenAI/Supabase 어댑터가 생기는 시점에 결정.

## 7. 이번 범위에 만들 것 (P0)

- `CampaignWizard`에서 승인 스텝 제거 (§3.1)
- `ProgressView` 라벨을 Figma 기준으로 변경 (§3.2), 데모/실제 이원화를 `architecture.md`에 문서화
- `lib/contracts/generator.ts`, `lib/contracts/repository.ts` 인터페이스 정의 (§5.1)
- `lib/demo/fixtureGenerator.ts`, `lib/demo/fixtureRepository.ts` 구현체 (§5.2), 기존 `lib/client/demo-store.ts` 로직 흡수
- `app/api/generate`, `app/api/campaigns`(POST/PATCH/GET), `app/api/signals` 라우트 핸들러 (§5.3), 전부 fixture 구현체 호출만 함
- `CampaignWizard`/`/campaigns/[id]`/`/p/[slug]`를 직접 import 대신 API 호출로 전환 (§5.4)
- `lib/demo/demo-campaign.ts` / `demoCampaign.ts` 네이밍 정리 (§4 항목 3)
- `spec.md` §4, `user-flow-and-wireframes.md`, `architecture.md` 갱신 (§3.3)

## 8. 이번 범위에 만들지 않을 것 (명시적 비범위)

- 실제 OpenAI Structured Outputs 연동 — `CampaignGenerator` 인터페이스만 준비, 구현은 fixture로 유지
- 실제 Supabase 마이그레이션/영속 저장 — `CampaignRepository` 인터페이스만 준비, 구현은 localStorage 기반 fixture로 유지
- Meta OAuth, 광고 객체 생성/활성화 — 기존에도 하커톤 비범위, 변경 없음
- 진행상황 페이지의 "실제 트랙"(다중일 대기, 실시간 응답 수집) 구현 — 라벨만 맞추고 동작은 데모 애니메이션 유지
- 여러 프로젝트를 실제로 CRUD하는 대시보드 (현재 3개 카드 중 2개는 클릭 불가 mock) — `spec.md` "우승 전략"의 단일 경로 원칙과 충돌하므로 확장하지 않는다
- 범용 어댑터 플러그인 시스템 ("어떤 AI 프로바이더든 꽂을 수 있게") — 문서가 이미 지정한 fixture/OpenAI 두 구현체만 필요, YAGNI
- fixture 생성기의 실제 입력 반영 로직 — §6 보류

## 9. 2인 소유권 경계 (갱신)

`spec.md` §9의 분업 정의는 그대로 유효하다. §5의 변경 이후 실제 코드에서 경계가 다음과 같이 강제된다.

- **개발자 A**: `app/page.tsx`, `app/new/`, `app/campaigns/[id]/`(및 `progress/`), `components/`, `lib/export/` — `fetch('/api/...')` 또는 `CampaignRepository`/`CampaignGenerator` 타입만 참조. `lib/demo/fixture*.ts` 내부 구현을 직접 import하지 않는다.
- **개발자 B**: `lib/contracts/`, `lib/demo/fixture*.ts`(현재) → 추후 `lib/ai/`, `lib/db/`(신규), `app/api/`, `app/p/[slug]/page.tsx`의 데이터 로딩 부분, `supabase/`(신규).
- 공유 계약(`lib/contracts/campaign.ts`, `generator.ts`, `repository.ts`)은 합의 후 한 명만 수정.
