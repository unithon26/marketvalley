# 아키텍처

상태: fixture 기반 mock 종단과 local Google OAuth 실제 계정 검증 완료, OpenAI adapter 구현·비활성, live 데이터 adapter·production Auth 설정 미연동
기준일: 2026-08-25

현재 저장소는 검증된 reference fixture와 서버 프로세스 메모리 저장소로 전체 발표 경로를 실행한다. OpenAI·Supabase·Meta 키가 필요 없고, 화면은 이후 live adapter에서도 같은 계약과 렌더러를 사용한다. OpenAI adapter는 구현돼 있지만 `CAMPAIGN_GENERATOR_MODE` 기본값이 `fixture`라 외부 요청과 과금이 발생하지 않는다.

Google 로그인은 Supabase Auth PKCE를 사용하는 서버 계약과 local 실제 계정 종단 검증까지 완료했다. `/auth/google → /auth/callback → /api/auth/session → /auth/logout`은 UI와 분리되어 있으며 토큰은 HttpOnly 쿠키에만 둔다. 동시 로그인은 `sb_flow_id`별 verifier와 이동 경로 쿠키로 격리한다. 임시 GNB는 `useAuthSession` 상태 hook과 `AuthControls` 표현을 나눠 디자인 교체 범위를 제한했다. 기존 fixture route는 발표 안정성을 위해 아직 로그인으로 보호하지 않는다. G3에서 Supabase repository와 RLS를 추가할 때 `requireVerifiedIdentity()`의 검증된 user id를 광고 소유권에 연결한다.

## 목표

발표용 mock과 후속 OpenAI·Supabase 연동이 화면 코드를 바꾸지 않고 같은 `CampaignSpec`, `CampaignGenerator`, `CampaignRepository` 경계를 사용하게 한다. 외부 서비스 장애가 발표를 막지 않으며 fixture도 실제 Route Handler와 제품 화면을 그대로 지난다.

## 구성

```text
2단계 사용자 입력
   ↓ POST /api/generate
CampaignGenerator ── mock: 키워드 기반 시각 template 선택 + 중립 문장 골격 + 입력값 결정적 주입
   │                live: 슬롯별 지시를 조합한 단일 OpenAI Structured Outputs
   ↓
CampaignSpec (Zod 검증, 단일 진실 공급원)
   ↓ POST /api/campaigns
CampaignRepository ── mock: Node.js 프로세스 메모리
                     live: Supabase server repository
   ├─ publish / getById / getBySlug
   ├─ recordReservation / getReservationSummary
   ├─ saveNextAction / delete
   └─ LandingRenderer / CarouselRenderer / Meta 게시 준비 ZIP
```

브라우저에는 자신이 만든 캠페인의 draft 소유 토큰만 `localStorage`에 둔다. 공개 랜딩의 이름·이메일·동의와 UTM은 예약 제출 요청으로 서버에 보내고, 예약자명단과 사람의 다음 행동은 서버 저장소가 소유한다.

## 상태 원칙

- `CampaignSpec` 외에 화면별 카피 복제본을 만들지 않는다.
- `/campaigns/[id]`는 id로, `/p/[slug]`는 slug로 저장소를 조회한다.
- 새 게시에는 고유 id와 slug를 발급해 이미 열린 다른 캠페인 화면과 상태가 섞이지 않게 한다.
- 상품명, 핵심 특징 3개, 문제·솔루션, 가치 제안, CTA와 공개 경로는 게시된 campaign snapshot에서 파생한다.
- 공개 랜딩의 title·description과 랜딩·캐러셀 색상은 같은 snapshot의 SEO·brand 필드에서 파생한다.
- 카드뉴스 표지와 랜딩 도입부는 같은 snapshot의 `templates` 필드에서 선택하며, tone이나 화면별 조건으로 암묵적으로 추론하지 않는다.
- mock 데이터는 화면에서 `데모 데이터`로 식별한다.
- P0 예약은 명시적 동의 뒤 이름과 이메일만 저장한다. IP와 원문 user-agent는 저장하지 않고, 목록 화면의 이메일은 마스킹한다.
- 저장·응답·판단·초기화 실패를 성공으로 표시하지 않으며 사용자가 재시도할 수 있다.
- 동일 입력의 게시 재시도는 같은 draft ID와 생성 결과를 재사용한다.

## Figma와 AI의 소유 경계

Figma renderer는 랜딩·캐러셀의 레이아웃, 타이포·색상 조합, 섹션 순서와 제품의 상태·개인정보·사람 판단 안내를 고정한다. AI는 새 HTML이나 레이아웃을 만들지 않고 허용된 템플릿 ID만 선택한다. 선택된 ID의 실제 색상과 시각 방향은 서버가 Figma 토큰으로 매핑한다.

AI가 채우는 문구는 상품 요약, 검증 가설, 동의 기반 사전예약 CTA, 가치제안, 후킹 3종, 게시 문구, 랜딩 각 섹션과 캐러셀 각 장이다. `lib/ai/campaignPrompts.ts`가 각 슬롯의 목적·길이·금지사항을 따로 정의한 뒤 하나의 developer prompt로 조합한다. 사용자 입력은 명령이 아닌 별도 JSON 자료로 전달한다. 전체 `CampaignSpec`은 한 번의 Responses API Structured Outputs 호출로 생성해 랜딩·캐러셀·Meta 문구의 고객·문제·특징·CTA가 어긋나지 않게 한다. OpenAI strict schema가 tuple을 지원하지 않는 경계는 같은 길이의 배열 출력 스키마로 변환한 뒤 기존 Zod 계약으로 재검증한다.

`schemaVersion`, `generation`, Figma 색상, `validation.decisionRule`, id·slug·공개 URL과 실제 응답은 서버 소유다. 모델 결과를 Zod로 검증한 뒤 서버 값으로 덮어쓰며, 생성 프롬프트의 변경은 `promptVersion`으로 추적한다.

## 실행 모드

| 모드 | 생성 | 공개·응답·판단 | 외부 키 |
| --- | --- | --- | --- |
| `fixture` (기본) | `FixtureCampaignGenerator` | `FixtureCampaignRepository` | 불필요, 외부 요청·과금 없음 |
| `openai` (비활성) | `OpenAICampaignGenerator` | 현재 fixture, 이후 Supabase adapter | OpenAI 키 필요, 호출 시 과금 |

생성 모드는 서버 전용 `CAMPAIGN_GENERATOR_MODE`로만 바꾼다. API 키가 존재해도 자동으로 `openai`를 선택하지 않으며, 설정 오류나 upstream 실패는 성공으로 대체하지 않고 503으로 반환한다. live 기본 후보 `gpt-4o-mini`는 무료 모델이 아니라 비용을 낮춘 선택이며 실제 활성화 전에 대표 입력 품질과 과금 한도를 별도로 검증한다.

mock 저장소의 `Map`은 한 Node.js 프로세스 안에서 브라우저 간 상태를 공유하지만 서버 재시작과 serverless 인스턴스 전환에는 유지되지 않는다. 따라서 로컬 발표와 단일 프로세스 QA에는 사용할 수 있고, Vercel에서 여러 기기의 실제 응답을 받을 때는 먼저 Supabase adapter로 교체해야 한다.

캐러셀 ZIP에는 선택된 Figma 표지와 같은 시각 규칙을 잇는 후속 카드로 구성된 1080×1350 PNG 5장을 넣는다. `Meta 게시 준비` ZIP에는 동일한 PNG 5장과 상품명·핵심 특징, 기본 문구, headline, CTA, 대상 고객 가설, 시각 방향, 표지·랜딩 템플릿 ID, 파일 목록과 절대 destination URL을 적은 `meta-ready.txt`를 함께 넣는다. 두 ZIP 모두 같은 숨은 React/CSS 렌더러를 사용하며 실제 Meta 계정에는 쓰지 않는다.

## 진행 상황 화면

`/campaigns/[id]/progress`의 `접수 → 준비 중 → 수집 중 → 결과 도착`은 현재 발표용 mock에서 약 2초 동안 재생되는 결정적 애니메이션이다. 따라서 현재의 `수집 중`은 실제 응답 수집 대기를 뜻하지 않는다.

Supabase adapter를 연결한 live 단계에서는 같은 4단계를 실제 서버 상태로 구동하고, 수집 기간도 고정 문구가 아니라 캠페인별 추정치로 표시한다. 화면 컴포넌트는 유지하고 상태 공급자만 교체한다.

## 배포 모델

Vercel에는 Next.js 앱 하나만 배포한다. live 단계에서 캠페인을 공개하는 행위는 새 앱을 배포하는 작업이 아니라 Supabase snapshot에 slug를 발급하고 기존 `/p/[slug]`가 읽게 하는 작업이다. 실제 배포, 외부 계정 연결과 행사 제출은 현재 수행하지 않았다.
