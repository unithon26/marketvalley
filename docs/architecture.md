# 아키텍처

상태: 계정별 durable lifecycle·Meta 자동 집행·Insights 리포트 운영 적용 완료
기준일: 2026-08-26

현재 저장소는 Anthropic 문구 생성기와 테스트 fixture가 같은 `CampaignGenerator` 계약을 사용한다. 제품은 Supabase 접수를 먼저 저장한 뒤 service-role worker가 lease로 캠페인을 claim해 AI 생성, 랜딩·카드 렌더, Meta 활성화, Insights 집계를 수행한다. fixture는 자동 테스트에서만 명시하며 기본 seed는 없다.

Google 로그인은 Supabase Auth PKCE를 사용하는 서버 계약과 local 실제 계정 종단 검증까지 완료했다. `/auth/google → /auth/callback → /api/auth/session → /auth/logout`은 UI와 분리되어 있으며 토큰은 HttpOnly 쿠키에만 둔다. Supabase repository 모드의 소유자 route는 `requireVerifiedIdentity()`를 통과한 cookie session client로 쿼리하고, RLS가 `auth.uid() = owner_id`를 다시 검사한다. fixture route는 발표 안정성을 위해 로그인 없이 유지한다.

## 목표

계정별로 접수부터 결과까지 권위 있는 상태를 저장하고 브라우저·배포·외부 API 실패와 무관하게 재시도 가능하게 한다. fixture도 같은 Route Handler와 제품 화면을 지나지만 live 실패를 성공으로 대체하지 않는다.

## 구성

```text
2단계 사용자 입력 → POST /api/campaigns → Supabase SUBMITTED
   ↓ service-role claim + 10분 lease
Claude Structured Outputs → CampaignSpec + slug → PREPARING
   ↓
ImageResponse 1080×1350 PNG 5장 + 공개 /p/[slug]
   ↓
Meta PAUSED 객체 → exact 계정·예산 확인 → ACTIVE 확인
   ↓
COLLECTING → Meta Insights snapshot + 방문·예약
   ↓ 종료 후 PAUSED 확인과 final snapshot
COMPLETED → /campaigns/[id] 최종 리포트
```

브라우저는 lifecycle 소유권 토큰을 저장하지 않는다. Google 세션과 RLS가 계정 소유권을 확인한다. 공개 랜딩의 이름·이메일·동의와 UTM은 예약 제출 요청으로 서버에 보내고, 예약자명단과 사람의 다음 행동은 서버 저장소가 소유한다.

## 상태 원칙

- `CampaignSpec` 외에 화면별 카피 복제본을 만들지 않는다.
- `/campaigns/[id]`는 id로, `/p/[slug]`는 slug로 저장소를 조회한다.
- 새 게시에는 고유 id와 slug를 발급해 이미 열린 다른 캠페인 화면과 상태가 섞이지 않게 한다.
- 상품명, 핵심 특징 3개, 문제·솔루션, 가치 제안, CTA와 공개 경로는 게시된 campaign snapshot에서 파생한다.
- 공개 랜딩의 title·description과 랜딩·캐러셀 색상은 같은 snapshot의 SEO·brand 필드에서 파생한다.
- 카드뉴스 표지와 랜딩 도입부는 같은 snapshot의 `templates` 필드에서 선택하며, tone이나 화면별 조건으로 암묵적으로 추론하지 않는다.
- 제품 화면에는 fixture seed나 더미 프로젝트를 넣지 않는다.
- P0 예약은 명시적 동의 뒤 이름과 이메일만 저장한다. IP와 원문 user-agent는 저장하지 않고, 목록 화면의 이메일은 마스킹한다.
- 저장·응답·판단·초기화 실패를 성공으로 표시하지 않으며 사용자가 재시도할 수 있다.
- 동일 입력의 게시 재시도는 같은 draft ID와 생성 결과를 재사용한다.

## Figma와 AI의 소유 경계

Figma renderer는 랜딩·캐러셀의 레이아웃, 타이포·색상 조합, 섹션 순서와 제품의 상태·개인정보·사람 판단 안내를 고정한다. AI는 새 HTML이나 레이아웃을 만들지 않고 허용된 템플릿 ID만 선택한다. 선택된 ID의 실제 색상과 시각 방향은 서버가 Figma 토큰으로 매핑한다.

AI가 채우는 문구는 상품 요약, 검증 가설, 동의 기반 사전예약 CTA, 가치제안, 후킹 3종, 게시 문구, 랜딩 각 섹션과 캐러셀 각 장이다. `lib/ai/campaignPrompts.ts`가 각 슬롯의 목적·길이·금지사항을 따로 정의한 뒤 하나의 system prompt로 조합한다. 사용자 입력은 명령이 아닌 별도 JSON 자료로 전달한다. Anthropic Messages API Structured Outputs 한 번으로 평면 문구 슬롯과 허용된 선택자를 받아 랜딩·캐러셀·Meta의 고객·문제·특징·CTA를 일치시킨다. 서버가 고정 필드를 조립한 뒤 기존 `CampaignSpec` Zod 계약으로 최종 검증한다.

`schemaVersion`, `generation`, Figma 색상, `validation.decisionRule`, id·slug·공개 URL과 실제 응답은 서버 소유다. 모델 결과를 Zod로 검증한 뒤 서버 값으로 덮어쓰며, 생성 프롬프트의 변경은 `promptVersion`으로 추적한다.

## 실행 모드

| 모드 | 생성 | 공개·응답·판단 | 외부 키 |
| --- | --- | --- | --- |
| `anthropic` (제품 기본) | `AnthropicCampaignGenerator` | fixture 또는 Supabase adapter | Anthropic 키 필요, 호출 시 과금 |
| `fixture` (테스트·fallback) | `FixtureCampaignGenerator` | `FixtureCampaignRepository` | 불필요, 외부 요청·과금 없음 |

생성 모드는 서버 전용 `CAMPAIGN_GENERATOR_MODE`로 바꾼다. 값이 없으면 제품 경로인 `anthropic`을 선택하고, 키가 없거나 upstream이 실패하면 성공으로 대체하지 않고 503으로 반환한다. `/new`는 요청 시점의 서버 환경을 읽어 키 준비 상태를 표시한다. Anthropic 생성 요청은 JSON Content-Type과 same-origin, Google `getClaims()`를 확인한다. Supabase 모드는 원자 DB RPC로 사용자 분당 3회·일일 30회·전체 일일 300회를 기본 제한한다. production Anthropic이 fixture 메모리 제한으로 실행되려 하면 503으로 닫는다. 자동 테스트와 비상 발표는 `fixture`를 명시한다.

mock 저장소의 `Map`은 한 Node.js 프로세스 안에서 브라우저 간 상태를 공유하지만 서버 재시작과 다중 인스턴스 전환에는 유지되지 않는다. 따라서 로컬 발표와 단일 프로세스 QA에만 사용하며 Oracle production의 실제 응답은 Supabase adapter에 저장한다.

카드 미리보기, ZIP과 Meta 업로드는 모두 `/api/campaigns/[id]/cards/[index]`와 같은 `ImageResponse` 렌더 함수를 사용한다. 사진 표지는 서버 렌더가 지원하는 PNG로 고정해 브라우저 캡처나 DOM 상태에 의존하지 않는다.

## 진행 상황 화면

신규 생성은 접수 성공 뒤 `/campaigns/[id]/progress`로 이동한다. 이 화면은 15초 polling과 focus 갱신으로 DB lifecycle을 보여주며, 사용자가 닫아도 Oracle의 1분 worker가 계속 처리한다. 일시 오류는 입력과 현재 단계를 유지한 `RETRY_WAIT`, 안전하게 복구할 수 없는 오류는 `FAILED`로 남긴다. UTC 날짜 단위의 내부 광고 생성 안전 한도는 다음 날짜 시작 직후까지 대기하고, 재개 시 시작 시각이 지난 광고 수집 구간을 새로 계산한다. `COMPLETED` 전에는 리포트 route가 progress로 되돌린다.

## 배포 모델

기존 Oracle Compute VM의 Kubernetes와 분리된 rootless Docker에서 Next.js standalone 앱, lifecycle worker와 Caddy를 Compose로 실행한다. Caddy는 사설 고포트만 bind하고 OCI public NLB가 별도 IP의 80·443을 전달하므로 기존 Traefik은 바꾸지 않는다. live 단계에서 캠페인을 공개하는 행위는 새 앱을 배포하는 작업이 아니라 Supabase snapshot에 slug를 발급하고 기존 `/p/[slug]`가 읽게 하는 작업이다. 개인 owner-only GitHub Actions는 사용자가 검토한 source SHA와 성공한 품질 gate를 확인하고 강제 명령 SSH gateway로 health가 확인된 release만 전환하며 실패 시 직전 이미지를 복구한다. 운영 Supabase migration, Google OAuth, Turnstile, Anthropic, Meta ACTIVE 실행과 Insights snapshot 경로를 적용했으며 Vercel과 Oracle은 같은 검증 source SHA를 배포한다. 상세 운영 경계는 [ADR-0019](decisions/0019-self-host-on-oracle-with-verified-ssh-releases.md), [ADR-0023](decisions/0023-run-account-owned-campaigns-as-a-durable-automatic-lifecycle.md)과 [배포 가이드](deployment.md)를 따른다.
