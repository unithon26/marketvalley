# 예약자명단(이름+이메일) 전환 및 A/B 작업 분담 설계

상태: 설계 확정, 구현 대기
작성일: 2026-08-25
관련 결정: `docs/decisions/0012-switch-anonymous-signal-to-named-reservation.md`

## 0. 이 문서를 읽는 사람에게

이 문서는 개발자 A(Claude Code 세션)와 개발자 B(Codex 세션)가 각자 독립적으로 작업을 시작할 수 있도록 계약과 순서를 고정한 것이다. 구현 중 이 문서와 다른 판단이 필요하면, 임의로 다르게 구현하지 말고 이 문서를 먼저 갱신한 뒤 진행한다.

**중요**: 이 문서가 뒤집는 기존 결정이 있다. `docs/decisions/0001-close-the-validation-loop.md`와 `docs/validation.md`는 "이름·이메일·전화번호를 받지 않는다"를 원칙으로 명시했고, `WORKLOG.md`(2026-08-25)에는 이 정확한 방향(이메일 수집 + 고정 광고 지표)을 제안한 다른 브랜치를 개발자 B가 반려한 기록이 있다. 이번엔 제품 책임자가 레퍼런스(`proo-landing.vercel.app`)를 보고 방향을 의도적으로 재확정했다 — `docs/decisions/0012-...md`를 반드시 먼저 읽을 것. 참고로 `docs/superpowers/specs/2026-08-24-figma-alignment-and-dependency-split-design.md` §2에 따르면 디자이너의 원본 Figma 리포트 화면도 원래 노출수·CTR·예약률·이메일 리스트 구성이었고, 어제 감사에서 "개인정보 비수집 원칙과 충돌"을 이유로 의도적으로 이탈했던 것 — 이번 전환은 그 Figma 원안으로 되돌아가는 결정이기도 하다.

## 1. 데이터 계약

`lib/contracts/repository.ts`의 신호 관련 타입을 아래로 교체한다.

```ts
export type ReservationUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export type ReservationInput = {
  campaignId: string;
  name: string;
  email: string;
  consent: true;              // 개인정보 동의 체크박스, 미체크 시 제출 자체가 안 됨
  utm?: ReservationUtm;
};

export type ReservationRecord = {
  id: string;
  name: string;
  email: string;               // 원문. 소유자 화면 전용, 공개 노출 금지
  utm?: ReservationUtm;
  reservedAt: string;
};

export type ReservationSummary = {
  total: number;
  recent: ReservationRecord[];
};
```

`CampaignRepository` 인터페이스 변경:

- `recordSignal(input: SignalInput)` → `recordReservation(input: ReservationInput): Promise<ReservationSummary>`
- `getSignalSummary(campaignId)` → `getReservationSummary(campaignId): Promise<ReservationSummary>`
- `DuplicateSignalError`는 유지하되 판정 기준을 `visitorId` → `(campaignId, email)`로 변경한다.
- `SignalInput`, `SignalCounts`, `SignalSummary`, `SignalDecisionStatus`, `InvalidSignalOptionError`는 삭제한다. `CampaignSpec.validation.signal`(질문·3개 선택지 스키마)도 함께 제거 대상이다 — B-2 작업에서 프롬프트와 스키마를 같이 정리한다.

Supabase 테이블 스케치 (`docs/spec.md`에도 반영됨):

```sql
create table campaign_reservation (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  name text not null,
  email text not null,
  email_hash text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  unique (campaign_id, email_hash)
);
```

`email_hash`는 기존에 스캐폴딩된 `SIGNAL_HASH_SECRET`으로 HMAC 해시해 dedupe에 쓴다. 원문 `email`은 소유자 화면·리스트 원본 조회용으로만 쓰고, 공개 화면이나 다른 캠페인 소유자에게는 절대 노출하지 않는다.

## 2. 리포트 지표 — 실제 vs 예시

`components/campaign-report.tsx`가 보여줄 지표를 두 그룹으로 명확히 나눈다. 예시 지표는 화면에 "예시 지표" 라벨(또는 동등한 시각적 구분)을 반드시 붙인다.

| 그룹 | 지표 | 데이터 소스 |
| --- | --- | --- |
| 실제 | 예약자 수 | `ReservationSummary.total` |
| 실제 | 예약자 리스트 (번호, 마스킹 이메일) | `ReservationSummary.recent`, 이메일은 화면에서 `seon****@gmail.com` 형태로 마스킹 |
| 예시(목업) | 노출 수, CTR(업계 평균 대비), 랜딩 체류시간, 이탈률, 예약률(업계 평균 대비) | 코드 내 고정 상수 (한 파일에 모아 나중에 교체하기 쉽게) |

결제·입금 관련 지표는 이번 스코프에 없다.

## 3. 화면·카피 변경 범위

- **공개 랜딩** (`components/renderers/public-landing.tsx`): 긍정/중립/부정 3버튼 UI를 이름·이메일 입력 필드 + 개인정보 동의 체크박스 + "사전예약하기" 버튼으로 교체. 제출 성공/실패/중복(이미 예약함) 상태 문구도 다시 쓴다.
- **랜딩 UTM 캡처**: 페이지 로드시 쿼리 파라미터(`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`)를 읽어 폼 제출 시 함께 전송한다. 분석/집계 화면은 이번 스코프에 없다 — 필드 저장까지만 한다.
- **리포트** (`components/campaign-report.tsx`): 3지선다 지표 카드 제거 → 예약자 수·리스트·예시 지표 블록으로 교체.
- **신뢰 문구**: `lib/ai/campaignPrompts.ts`의 trust-copy 규칙과 랜딩 FAQ의 "개인정보를 받나요? 아니요" 계열 문구를 "이름과 이메일은 동의 후에만 예약자명단에 포함됩니다"류로 전면 교체.
- **문서**: `docs/spec.md`(P0-4, 지표 정의, Supabase 스키마), `docs/validation.md`(안전성과 진실성)는 이미 ADR-0012 기준으로 갱신됨 — 추가로 손댈 필요 없음, 참고만 할 것.

## 4. 작업 순서 및 A/B 분담

기존 파일 소유권 관례(개발자 A = 화면/렌더러/E2E, 개발자 B = 계약/fixture/AI/DB/API)를 유지한다.

1. **[0] 계약 확정** — 위 §1의 타입을 `lib/contracts/repository.ts`에 반영하고, `lib/demo/fixtureRepository.ts`의 신호 관련 메서드를 예약 관련 메서드로 교체한 안정된 스텁을 커밋한다. A/B 모두 이 커밋 이후에 각자 작업을 시작한다.
2. **B-1 (Supabase 어댑터)**과 **B-2 (OpenAI 어댑터)**를 병렬 진행한다.
   - B-1: `campaign_reservation` 테이블 생성, `CampaignRepository`의 Supabase 구현체 작성, dedupe·마스킹 로직 구현.
   - B-2: `lib/ai/campaignPrompts.ts`의 신뢰 문구·신호 관련 슬롯을 예약자명단 모델에 맞게 수정하고, `CampaignGenerator`의 OpenAI(Structured Outputs) 구현체를 연결한다.
3. B-1, B-2가 끝나면 **A-1 (화면)**을 진행한다 — 공개 랜딩 폼, 리포트 화면, UTM 캡처.
4. **OAuth 버튼(표시만)**은 위 순서와 무관하게 아무 때나 병행 가능하다. 로그인 연결·계정별 데이터 격리는 이번 스코프에 없다.
5. **서버 배포**는 B-1·B-2가 끝난 직후 진행한다.
6. **Meta 실연동**은 이번 스코프 밖이다 (앱 심사 등 외부 승인 필요, 기존 "Meta 게시 준비" 텍스트 내보내기 방식 유지).

## 5. 테스트 영향

`tests/e2e/demo-flow.spec.ts`는 3지선다 제출, "익명으로 응답하기", 긍정 신호율·기준 충족 문구를 광범위하게 검증한다. 이 계약 변경으로 대부분의 assertion이 깨진다. A-1 단계(또는 그 직후)에서 다음 기준으로 다시 작성한다:

- 이름/이메일 폼 제출 → 성공 상태 문구
- 같은 이메일 재제출 → 중복 안내 문구 (기존 "이미 참여했어요"에 대응하는 새 문구)
- 리포트에 실제 예약자 수·리스트가 반영되는지
- 예시 지표 블록에 라벨이 표시되는지
- UTM 파라미터가 저장되는지 (API 레벨 assertion으로 충분, UI 집계는 없음)

## 6. 남은 미결 사항

- 예시 지표의 구체적인 상수 값(노출수 4,312 같은)을 그대로 쓸지, 우리 제품 톤에 맞게 다른 숫자로 바꿀지는 A-1 단계에서 화면 작업자가 정한다.
- UTM 필드를 나중에 카드뉴스 변형별 성과 분석에 쓸지는 이번 스코프에 포함하지 않으며, 별도 브레인스토밍이 필요하다.
