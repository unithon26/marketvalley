# 아키텍처

상태: mock 종단 구현 완료, live adapter 미연동
기준일: 2026-08-24

현재 저장소는 아래 구조의 mock 경로를 구현했다. 생성은 검증된 fixture, 공개 응답과 사람의 판단은 브라우저 `localStorage`를 사용하며 외부 키가 필요 없다.

## 목표

발표용 mock과 후속 OpenAI·Supabase 연동이 화면 코드를 갈아엎지 않고 같은 계약을 사용하게 한다. 외부 서비스 장애가 발표 흐름을 막지 않으며, fixture도 실제 화면·렌더러를 그대로 거친다.

## 구성

```text
사용자 입력
   ↓
CampaignGenerator ── mock: fixture 기반 생성
   │                live: OpenAI Structured Outputs
   ↓
CampaignSpec (Zod 검증, 단일 진실 공급원)
   ├─ LandingRenderer ── published public page
   ├─ CarouselRenderer ── PNG / ZIP
   └─ Meta 게시 준비 ── file / copy package
   ↓
CampaignRepository ── mock: browser localStorage
                     live: Supabase server repository
   ├─ publish / findPublished
   ├─ submitSignal / aggregateSignals
   └─ saveNextAction
```

## 상태 원칙

- `CampaignSpec` 외에 화면별 카피 복제본을 만들지 않는다.
- 프로젝트명, 가치 제안과 CTA는 결과물마다 복제하지 않고 같은 source field에서 생성한다.
- mock 데이터는 화면에서 `데모 데이터`로 식별할 수 있게 한다.
- 공개 snapshot과 로컬 초안을 구분한다. 승인된 snapshot은 수정하지 않고 변경이 필요하면 새 캠페인을 만든다.
- P0의 선택형 응답에는 이름, 이메일, 전화번호, IP와 원문 user-agent를 저장하지 않는다.

## 실행 모드

| 모드 | 생성 | 공개·응답 | 외부 키 |
| --- | --- | --- | --- |
| `mock` | 로컬 fixture | 브라우저 저장소 | 불필요 |
| `live` | OpenAI adapter | Supabase adapter | 필요, 후속 구현 |

현재는 `mock`만 구현했다. live 모드의 환경변수 이름과 adapter 선택 방식은 실제 연동 작업에서 확정하며, 각 adapter와 보안 검증이 끝난 뒤 별도 작업으로 연다.

## 배포 모델

Vercel에는 Next.js 앱 하나만 배포한다. live 단계에서 캠페인을 공개하는 행위는 새 앱을 배포하는 작업이 아니라 Supabase snapshot에 slug를 발급하고 기존 `/p/[slug]`가 읽게 하는 작업이다.

현재 `/p/demo`는 같은 브라우저 저장소를 사용하므로 다른 기기와 데이터를 공유하지 않는다. 결과 화면은 모든 수치를 목데이터라고 명시한다. 실제 공개 시연은 Supabase adapter가 연결된 뒤 수행한다.

## 진행 상황 화면 (데모/실제 이원화)

`ProgressView`의 4단계(접수 → 준비 중 → 수집 중 → 결과 도착)는 두 트랙을 가진다.

- 데모 트랙(현재 구현): 라벨만 이 4단계를 따르고, 동작은 ~2초 자동 진행 애니메이션이다. "수집 중"은 실제 대기가 아니라 라벨이다.
- 실제 트랙(Supabase 연동 이후): "수집 중"이 실제 다중일 대기 상태가 되고, 결과 제공까지의 기간은 고정값이 아니라 계산된 추정치가 된다.

상세 근거는 `docs/superpowers/specs/2026-08-24-figma-alignment-and-dependency-split-design.md` §3.2를 따른다.
