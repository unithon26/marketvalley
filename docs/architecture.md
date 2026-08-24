# 아키텍처

상태: 목표 설계, 미구현
기준일: 2026-08-24

현재 저장소에는 아래 구조를 구현한 제품 코드가 없다. 기존 랜딩페이지 템플릿과 메인 웹사이트 디자인을 확인한 뒤 적용할 목표 경계만 기록한다.

## 목표

향후 발표용 mock과 OpenAI·Supabase 연동이 화면 코드를 갈아엎지 않고 같은 계약을 사용하게 한다. 외부 서비스 장애가 발표 흐름을 막지 않으며, mock 결과도 실제 화면·렌더러를 그대로 거치게 한다.

## 구성

```text
사용자 입력
   ↓
CampaignGenerator ── mock: fixture 기반 생성
   │                live: OpenAI Structured Outputs
   ↓
CampaignSpec (Zod 검증, 단일 진실 공급원)
   ├─ LandingRenderer ── studio preview / public page
   ├─ CarouselRenderer ── preview / PNG / ZIP
   └─ Meta 게시 준비 ── 같은 문구와 공개 URL 조합
   ↓
CampaignRepository ── mock: browser localStorage
                     live: Supabase server repository
   ├─ publish / findPublished
   ├─ submitSignal / aggregateSignals
   └─ saveNextAction
```

## 상태 원칙

- `CampaignSpec` 외에 화면별 카피 복제본을 만들지 않는다.
- 프로젝트명, 가치 제안과 CTA 수정은 같은 source field를 바꾼다.
- mock 데이터는 화면에서 `데모 데이터`로 식별할 수 있게 한다.
- 공개 snapshot과 로컬 초안을 구분한다. 재게시 전 수정은 공개 페이지에 반영되지 않는 것이 live 목표다.
- P0의 선택형 응답에는 이름, 이메일, 전화번호, IP와 원문 user-agent를 저장하지 않는다.

## 계획된 실행 모드

| 모드 | 생성 | 공개·응답 | 외부 키 |
| --- | --- | --- | --- |
| `mock` | 로컬 fixture | 브라우저 저장소 | 불필요 |
| `live` | OpenAI adapter | Supabase adapter | 필요, 후속 구현 |

환경변수 이름과 adapter 선택 방식은 구현 시작 시 확정한다. live 모드는 각 adapter와 보안 검증이 끝난 뒤 별도 작업으로 연다.

## 배포 모델

Vercel에는 Next.js 앱 하나만 배포한다. live 단계에서 캠페인을 공개하는 행위는 새 앱을 배포하는 작업이 아니라 Supabase snapshot에 slug를 발급하고 기존 `/p/[slug]`가 읽게 하는 작업이다.

계획된 mock 단계의 `/p/demo`는 같은 브라우저 저장소를 사용하므로 다른 기기와 데이터를 공유하지 않는다. 이 한계는 화면에 명시하고 실제 공개 시연은 Supabase adapter가 연결된 뒤 수행한다.
