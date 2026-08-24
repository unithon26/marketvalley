# marketvali 해커톤 MVP 스펙

상태: 기능 구현 기준 v0.4, 화면 미구현
작성일: 2026-08-24
목표: 기존 랜딩페이지 템플릿과 디자인 담당자의 메인 웹사이트 디자인을 기준으로 2026 UNITHON 발표용 종단 흐름을 구현한다.

현재 저장소에는 화면, API, fixture와 테스트 구현이 없다. 이 문서의 경로, 계약과 완료 기준은 향후 구현 요구사항이며 시각 디자인은 기존 템플릿과 디자인 담당자의 확정본이 우선한다.

## 1. 우승 전략

심사에서 보여줄 것은 생성 기능의 개수가 아니다. 아이디어가 실제 관심 신호로 이어지기 전 존재하던 기획, 재작성, 조판, 배포, 취합 업무가 하나의 흐름에서 사라졌다는 점이다.

발표의 제품 문장은 다음으로 고정한다.

> 아이디어 하나만 남기세요. 첫 시장 반응을 얻기 전까지의 제작 업무는 marketvali가 지웁니다.

제품은 `가설 승인 → 캠페인 자동 구성 → 공개·내보내기 → 관심 응답 회수 → 사람의 다음 판단`이라는 한 경로만 깊게 완성한다. 자유도, 채널 수, 템플릿 수보다 메시지 일관성, 실제 URL, 실제 응답 한 건, 시각적 완성도와 실패 복구를 우선한다.

## 2. P0 범위

P0는 하나라도 빠지면 발표용 제품이 완성되지 않은 것으로 본다.

### P0-1. 아이디어 입력

화면 `/`에서 다음을 받는다.

- 필수: 아이디어 설명, 최대 600자
- 선택: 예상 고객, 최대 120자
- 선택: 원하는 신호 `문제 공감` 또는 `사용 의향`
- 선택: 분위기 `신뢰감`, `대담함`, `따뜻함` 중 하나

선택값이 비어 있으면 모델이 합리적으로 추론하되 `assumptions`에 표시한다. 제출 버튼을 연속 클릭할 수 없게 하고, 오류가 나면 입력을 보존한다.

완료 기준:

- 필수값 검증과 오류 문구가 있다.
- 제공된 데모 입력을 한 번에 채우는 `예시 불러오기`가 있다.
- 모바일과 노트북 화면에서 주요 CTA가 보인다.

### P0-2. 검증 가설 및 캠페인 생성

서버에서 OpenAI Responses API와 Structured Outputs를 사용해 단일 `CampaignSpec` JSON을 생성한다. 자유 형식 텍스트를 파싱하지 않는다.

완료 기준:

- Zod 스키마 검증을 통과한 결과만 저장한다.
- 타깃, 문제, 해결, 기대 신호, 반증 조건이 각각 한 문장으로 나온다.
- 개인정보가 필요 없는 선택형 질문 1개와 선택지 3개가 나온다.
- 이 가설을 약화시키는 관찰 결과가 `invalidationEvidence` 한 문장으로 나온다.
- 다음 검토 기준은 모델이 임의로 만들지 않고 시스템 기본값 `응답 5개 중 긍정 3개`를 사용하며 사용자가 가설 화면에서 승인한다.
- 확인되지 않은 숫자, 고객 후기, 인증, 효능을 만들어내지 않는다.
- 사실 검토가 필요한 표현은 `claimsToReview`에 별도로 표시한다.
- 전송 또는 스키마 오류는 한 번만 재시도하고, 이후 데모 샘플 전환을 제공한다.

### P0-3. 캠페인 스튜디오

화면 `/studio/[id]`는 다음 네 탭을 제공한다.

1. `검증 가설`: 고객, 문제, 해결, 기대 신호, 반증 조건, 가정
2. `랜딩`: 데스크톱·모바일 미리보기
3. `인스타`: 5장 캐러셀 미리보기와 게시 문구
4. `판단`: 공개 URL, 응답 분포, 사전 판단 기준, 사람의 다음 행동

AI 채팅창을 메인 UI로 사용하지 않는다. 각 미리보기에는 현재 실험의 `고객·검증 질문·기대 신호`를 보여주는 작은 실험 배지를 고정해, 예쁜 결과물이 아니라 하나의 가설에서 나온 캠페인임을 드러낸다.

완료 기준:

- 한 탭의 내용이 아니라 동일한 `CampaignSpec`이 모든 탭을 렌더링한다.
- 프로젝트명, 핵심 가치 제안, CTA 문구를 직접 수정하면 아래 렌더링 매핑에 따라 랜딩과 캐러셀에 즉시 함께 반영된다.
- 수정된 필드가 영향을 주는 미리보기에 `동기화됨` 표시가 나타난다.
- 저장하지 않은 변경과 생성 중 상태가 명확히 보인다.
- 판단 탭은 현재 응답이 사전 기준에 충분한지 사실만 보여주고, `계속 검증`, `메시지 수정`, `보류` 선택은 사용자가 한다.
- 선택한 다음 행동은 저장되어 새로고침 뒤에도 유지된다.

### P0-4. 공개 랜딩페이지

화면 `/p/[slug]`는 스튜디오와 동일한 `CampaignSpec`으로 렌더링된다.

고정 섹션:

1. Hero와 CTA
2. 고객의 문제 3개
3. 제안 가치 3개
4. 작동 방식 3단계
5. FAQ 3개
6. 마지막 CTA

CTA를 누르면 `CampaignSpec.validation.signal`의 질문과 세 선택지를 보여준다. 제출된 답은 긍정·중립·부정 중 하나의 익명 `signal_response`로 기록한다. P0에서는 이메일, 이름, 전화번호 등 개인정보를 받지 않는다.

완료 기준:

- 공개 URL을 시크릿 브라우저와 모바일 뷰포트에서 열 수 있다.
- 같은 브라우저는 같은 캠페인에 한 번만 응답할 수 있고 완료 피드백을 받는다.
- 실제 응답과 세 선택지의 분포가 스튜디오 판단 탭에 반영된다.
- 랜딩 HTML에 `undefined`, 잘린 핵심 문구, 빈 필수 섹션이 없다.

### P0-5. 인스타그램 캐러셀, 게시 문구와 광고 등록 패키지

캐러셀은 1080×1350 비율의 5장으로 고정한다.

1. Hook
2. Problem
3. Insight
4. Solution
5. CTA

AI는 문구와 선택적 배경 이미지 프롬프트만 만든다. 모든 텍스트는 디자이너가 정의한 React/CSS 템플릿으로 조판한다.

`광고 등록 패키지`는 별도의 광고 카피를 다시 생성하지 않는다. `CampaignSpec`과 게시된 랜딩 URL에서 캐러셀 파일, 기본 문구, headline, CTA, 대상 고객 가설과 destination URL을 조합해 사람이 Meta Ads Manager에 옮기거나 향후 adapter에 전달할 수 있는 한 화면으로 보여준다. 이 화면의 사용자용 이름은 `Meta 게시 준비`이며 실제 광고가 등록됐다고 표현하지 않는다.

완료 기준:

- 미리보기와 PNG 결과의 줄바꿈·글꼴·여백이 일치한다.
- 모든 장을 개별 PNG 또는 하나의 ZIP으로 받을 수 있다.
- 파일명은 `01-hook.png`부터 `05-cta.png`까지 정렬된다.
- 캡션, 후킹 문구 3개, CTA, 해시태그를 복사할 수 있다.
- `Meta 게시 준비`에서 사용할 미디어, 기본 문구, headline, CTA, 대상 고객 가설과 랜딩 URL을 한 번에 확인할 수 있다.
- 예산, 통화, 기간, 세부 타기팅과 활성화는 AI가 임의로 확정하지 않으며 P0에서 Meta 계정이나 결제수단에 접근하지 않는다.
- 이미지 생성 API 없이도 완성된 기본 시각 결과가 나온다.

### P0-6. 결정적 데모 모드

`demoCampaign.ts`에 완성된 샘플 `CampaignSpec`과 로컬 배경 자산을 둔다. 데모 모드는 프로덕션 결과와 같은 렌더러를 사용해야 하며 별도의 가짜 UI를 만들지 않는다.

완료 기준:

- `NEXT_PUBLIC_DEMO_MODE=true` 또는 UI의 `데모 결과 열기`로 접근할 수 있다.
- OpenAI, 이미지 생성, Supabase 중 하나가 실패해도 샘플 흐름으로 랜딩·캐러셀·응답·사람의 판단·다운로드 시연을 끝낼 수 있다.
- 발표 전 데모용 공개 URL과 백업 화면 녹화를 준비한다.

## 3. P1과 중단 기준

P0와 배포가 모두 안정화된 뒤에만 진행한다.

- 선택한 카드 또는 Hero의 텍스트 없는 배경 이미지 1장 생성
- 특정 필드 AI 재작성
- 캠페인 QR 코드
- 페이지 조회와 응답의 단순 전환율
- 공유용 Open Graph 이미지
- 팀 소유 테스트 광고 계정에서 `PAUSED` 상태 광고 객체를 만드는 제한된 연동 실험

Meta 연동은 다음 단계 경계를 지킨다.

- P0: OAuth, 계정 연결, 광고 객체 쓰기, 실제 집행 없이 `Meta 게시 준비` 미리보기만 제공한다.
- 해커톤 P1: P0와 발표 준비가 모두 끝났고 팀 소유 테스트 계정과 필요한 권한이 준비된 경우에만 `PAUSED` 생성까지 실험한다. UI와 서버 모두 `ACTIVE` 전환을 막는다.
- 실제 제품: 사용자가 OAuth로 계정을 연결하고 광고 계정·페이지·Instagram identity를 선택한 뒤, 서버가 `PAUSED` 초안을 만들고 계정·통화·시간대·소재·랜딩·타기팅·총예산·종료 시각을 한 화면에서 승인받은 경우에만 활성화할 수 있다. 결제수단 등록과 본인 확인은 Meta UI에서 사용자가 수행한다.

상세 결정과 보안 불변조건은 `docs/decisions/0003-stage-meta-automation-behind-human-approval.md`를 따른다.

다음 기능은 시작하지 않는다.

- Meta 광고 자동 활성화, 결제수단 등록, 무인 예산 증액·재시작
- Instagram 일반 게시물 자동 업로드
- 드래그 앤 드롭 페이지 빌더
- 로그인, 권한, 협업, 결제
- 두 번째 랜딩 또는 캐러셀 디자인 테마
- 범용 리서치 에이전트와 경쟁사 크롤러
- 자동 A/B 승자 판정

P1 때문에 P0 통합이나 발표 준비가 1시간 이상 밀리면 즉시 P1을 제거한다.

## 4. 화면 기능 명세

아래 내용은 화면의 기능과 상태 요구사항만 정의한다. 배치, 색상, 타이포그래피와 컴포넌트 외형은 디자인 담당자의 확정본을 따르며 이 문서의 설명을 시각 참고자료로 사용하지 않는다.

### `/`

- 문제를 한 문장으로 설명하는 Hero
- 아이디어 입력 카드
- 선택 입력은 접힌 `조금 더 정확하게` 영역
- 예시 불러오기
- 생성 CTA
- 제품이 없애는 기존 작업을 짧은 `before/after`로 표시

### `/studio/[id]`

- 상단: 제품명, 저장 상태, 공개 CTA
- 좌측 또는 상단 탭: 가설, 랜딩, 인스타, 판단
- 우측 또는 하단: 사실 확인 경고와 핵심 필드 편집
- 랜딩 미리보기는 desktop/mobile 전환
- 인스타 미리보기는 5장 순차 탐색과 ZIP 다운로드
- 각 미리보기에는 동일한 고객·검증 질문·기대 신호를 나타내는 실험 배지
- 판단 탭은 실제 응답 분포, 사전 기준과 표본 부족 상태, 사용자의 다음 행동 선택을 표시

### `/p/[slug]`

- 모바일 우선 랜딩페이지
- 동일 CTA를 Hero와 마지막 섹션에 배치
- CTA 뒤 선택형 질문과 응답 성공·중복 상태 표시
- marketvali 브랜드는 작은 `Made with` 수준으로만 노출

## 5. 데이터 계약

`CampaignSpec`은 제품의 단일 진실 공급원이다. UI마다 별도 카피 상태를 만들지 않는다.

```ts
type CampaignSpec = {
  schemaVersion: "1";
  generation: {
    promptVersion: string;
    model: string;
    generatedAt: string;
  };
  project: {
    name: string;
    oneLiner: string;
    category: string;
    language: "ko";
  };
  validation: {
    customer: string;
    problem: string;
    solution: string;
    expectedSignal: string;
    invalidationEvidence: string;
    assumptions: string[];
    signal: {
      type: "problem_confirmation" | "solution_interest";
      ctaLabel: string;
      question: string;
      options: [SignalOption, SignalOption, SignalOption];
      successMessage: string;
    };
    decisionRule: {
      minimumResponses: number;
      minimumPositiveResponses: number;
      description: string;
    };
  };
  brand: {
    tone: "trust" | "bold" | "warm";
    primaryColor: string;
    accentColor: string;
    visualDirection: string;
  };
  messaging: {
    valueProposition: string;
    hooks: [string, string, string];
    caption: string;
    hashtags: string[];
  };
  landing: {
    seoTitle: string;
    hero: { eyebrow: string; supportingText: string };
    painPoints: Array<{ title: string; body: string }>;
    benefits: Array<{ title: string; body: string }>;
    steps: Array<{ title: string; body: string }>;
    faq: Array<{ question: string; answer: string }>;
  };
  carousel: {
    hookBody: string;
    problem: CarouselContent;
    insight: CarouselContent;
    solutionBody: string;
    ctaBody: string;
    visualPrompts: [string, string, string, string, string];
  };
  safety: {
    claimsToReview: string[];
    prohibitedClaimsRemoved: string[];
  };
};

type CarouselContent = {
  headline: string;
  body: string;
};

type SignalOption = {
  id: "positive" | "neutral" | "negative";
  label: string;
};
```

Zod에서 배열 길이와 문자열 최대 길이를 제한한다. 한국어 기준 권장 상한은 Hero H1으로 쓰는 `valueProposition` 40자, 카드 headline 28자, 카드 body 90자다. UI에서 자르지 말고 스키마와 생성 단계에서 맞춘다.

### 공유 문구 렌더링 매핑

중복 저장된 문자열을 찾아 바꾸는 방식은 사용하지 않는다. 렌더러가 아래 source field를 직접 참조한다.

| Source field | 랜딩 사용처 | 캐러셀 사용처 |
| --- | --- | --- |
| `project.name` | Header 제품명 | 모든 장 footer |
| `messaging.valueProposition` | Hero H1 | 4장 Solution headline |
| `messaging.hooks[0]` | SEO 설명 보조 | 1장 Hook headline |
| `validation.signal.ctaLabel` | Hero·마지막 CTA 버튼 | 5장 CTA headline |
| `validation.signal.question` | CTA 응답 모달 | 5장 CTA body |

`Meta 게시 준비`도 별도 문구 상태를 만들지 않는다. 기본 문구는 `messaging.caption`, headline은 `messaging.hooks[0]`, CTA는 `validation.signal.ctaLabel`, 대상 고객 가설은 `validation.customer`, destination은 게시 API가 반환한 공개 URL을 사용한다.

따라서 위 세 편집 가능 필드의 변경은 AI 재생성 없이 양쪽 결과에 즉시 반영된다. `landing.hero`와 `carousel`은 이 문구를 별도 복제하지 않는다.

## 6. 기술 구조

### 선택 스택

- Next.js App Router, TypeScript, Tailwind CSS
- Zod
- OpenAI JavaScript SDK와 Responses API
- 텍스트 모델 기본값 `gpt-5.6-terra`, 환경변수 `OPENAI_TEXT_MODEL`로 교체 가능
- 선택적 이미지 모델 `gpt-image-2`, 텍스트 없는 배경 한 장에만 사용
- Supabase Postgres
- `html-to-image`와 JSZip
- Vercel 배포
- Vitest 단위 테스트, 구현 이후 선정할 핵심 흐름 E2E 도구
- 패키지 관리자는 `pnpm`

별도 백엔드 서버, 메시지 큐, 워커, 컨테이너, 벡터 데이터베이스는 사용하지 않는다.

### 배포 모델

Vercel에는 marketvali Next.js 애플리케이션 하나를 배포한다. 사용자가 캠페인을 공개할 때마다 별도 서버나 Vercel 프로젝트를 만들거나 다시 배포하지 않는다. `POST /api/campaigns`가 Supabase의 캠페인 row를 생성 또는 갱신하고 slug를 발급하면 이미 배포된 동적 경로 `/p/[slug]`가 그 snapshot을 읽어 즉시 공개한다.

따라서 제품 용어를 다음처럼 구분한다.

- `앱 배포`: 개발자가 코드 변경을 Vercel에 반영하는 행위
- `캠페인 게시`: 사용자가 현재 `CampaignSpec` snapshot을 저장하고 공개 URL을 발급받는 행위

캠페인 게시 성공을 앱 배포 성공으로 표현하지 않는다. 공개 페이지는 게시 당시 snapshot을 사용하며 로컬 초안 수정은 재게시 전까지 반영하지 않는다.

### 계획된 디렉터리 경계

```text
app/
  page.tsx
  studio/[id]/page.tsx
  p/[slug]/page.tsx
  api/generate/route.ts
  api/campaigns/route.ts
  api/signals/route.ts
components/
  input/
  studio/
  renderers/landing/
  renderers/carousel/
lib/
  ai/
  contracts/campaign.ts
  db/
  demo/demoCampaign.ts
  export/
supabase/migrations/
tests/
```

`lib/contracts/campaign.ts`는 두 개발자가 함께 합의한 뒤 한 명만 소유한다. 랜딩과 캐러셀 렌더러는 API를 직접 호출하지 않는다.

### API 경계

- `POST /api/generate`: 입력을 검증하고 `CampaignSpec`을 반환한다. 성공 시 클라이언트가 `crypto.randomUUID()`로 `draftId`를 만들고 `localStorage`에 spec을 저장한 뒤 `/studio/[draftId]`로 이동한다.
- `POST /api/campaigns`: `{ draftId, spec }`을 다시 검증해 공개 snapshot으로 저장한다. 같은 `draftId` 재요청은 중복 캠페인을 만들지 않고 동일 레코드를 갱신하며 `{ id, slug, url, publishedAt }`을 반환한다.
- `POST /api/signals`: `{ campaignId, visitorId, optionId }`를 받아 공개 snapshot에서 `signalType`을 읽고, 방문자 식별자를 서버에서 해시한 뒤 익명 응답 한 건을 기록한다. 클라이언트가 보낸 신호 유형은 신뢰하지 않는다.
- `PATCH /api/campaigns`: `{ campaignId, draftId, nextAction }`을 받아 소유 draft가 맞을 때만 사람의 선택 `continue`, `revise`, `pause`를 저장한다.
- `GET /api/campaigns?id=...`: 공개된 spec과 선택지별 응답 집계를 반환한다.

모든 route handler에서 입력 크기와 Zod 스키마를 검사한다. `POST /api/signals`는 신호 유형을 실제 공개 snapshot의 `validation.signal.type`에서 파생하고, 요청의 선택지가 snapshot의 `validation.signal.options`에 있는지 서버에서 다시 확인한다. DB unique 충돌은 서버 오류가 아니라 `alreadyResponded` 결과로 변환한다. OpenAI 키와 Supabase 서버 키는 클라이언트 번들에 포함하지 않는다.

### 데이터베이스

```text
campaigns
- id uuid primary key
- draft_id uuid unique not null
- slug text unique not null
- spec jsonb not null
- status text not null
- next_action text null check in ('continue', 'revise', 'pause')
- created_at timestamptz
- updated_at timestamptz

signals
- id bigint generated identity primary key
- campaign_id uuid references campaigns(id)
- signal_type text not null check in ('problem_confirmation', 'solution_interest')
- option_id text check in ('positive', 'neutral', 'negative')
- anonymous_id_hash text not null
- created_at timestamptz
- unique (campaign_id, anonymous_id_hash)
```

초안은 `localStorage`에 보존해 새로고침과 API 실패에 대비한다. 게시 시점의 spec만 DB snapshot이 되며 이후 로컬 수정은 다시 게시하기 전까지 공개 페이지에 반영되지 않는다.

공개 페이지는 첫 방문 시 무작위 `visitorId`를 `localStorage`에 만들고 HTTPS로 서버에 보낸다. 서버는 `SIGNAL_HASH_SECRET`으로 HMAC 해시만 저장한다. DB 접근은 서버에서만 수행하며 IP 주소와 원문 user-agent를 저장하지 않는다.

### 지표 정의

서로 다른 분모와 수집 주체를 가진 지표를 하나의 `전환율`로 합치지 않는다.

- 긍정 신호율: `positive 응답 수 / 전체 선택형 응답 수`. P0에서 실제로 수집하고, 응답이 0이면 비율 대신 `아직 응답 없음`을 표시한다.
- 랜딩 응답률: `선택형 응답 수 / 랜딩 방문 수`. 방문 이벤트를 실제로 구현한 P1 이후에만 표시한다.
- Meta 링크 CTR: Meta Insights가 반환한 `링크 클릭 수 / 노출 수`. Meta 연동 이후에만 표시하며 랜딩 응답률과 별도 영역에 둔다.

P0에는 예약 폼이 없으므로 `예약률`이라는 명칭을 사용하지 않는다. 표본이 작을 때 시장성이 검증됐다고 해석하지 않고, 응답 수·분포·사전 기준과 표본 부족 상태만 보여준다.

### 외부 의존성 경계

Route Handler가 SDK를 직접 여기저기 호출하지 않도록 다음 인터페이스 뒤에 둔다.

```ts
interface CampaignGenerator {
  generate(input: IdeaInput): Promise<CampaignSpec>;
}

interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordSignal(input: SignalInput): Promise<SignalSummary>;
  getSignalSummary(campaignId: string): Promise<SignalSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
}
```

실서비스는 OpenAI·Supabase adapter를, 테스트와 데모 모드는 fixture·브라우저 저장 adapter를 사용한다. 데모 모드는 생성뿐 아니라 공개 페이지 조회, 응답 기록, 집계까지 같은 브라우저에서 실제 흐름처럼 동작해야 한다. E2E 도구는 템플릿 통합 후 선택하며 외부 키나 네트워크 없이 이 adapter를 검증해야 한다.

## 7. AI 생성 규칙

- 하나의 호출에서 전체 `CampaignSpec`을 생성한다.
- Structured Outputs의 JSON Schema와 서버 Zod 검증을 함께 사용한다.
- 입력에 없는 수치, 후기, 수상, 인증, 효능, 가격을 발명하지 않는다.
- 실제 인터뷰 근거가 없는 베타테스터 후기, 고객 인용문, 사용 인원은 placeholder로도 만들지 않는다.
- 추론한 정보는 `assumptions`, 확인이 필요한 주장은 `claimsToReview`에 넣는다.
- 모델 결과를 HTML로 직접 실행하지 않는다. 모든 출력은 React 렌더러의 텍스트 데이터로만 사용한다.
- 프롬프트는 `promptVersion`을 가지며 결과와 함께 기록한다.
- 기본 생성은 낮은 reasoning effort로 지연을 줄이고, 실패 시 동일 요청을 한 번만 재시도한다.
- 이미지 모델은 글자, 로고, UI, 카드 완성본을 생성하지 않는다.
- 판단 기준의 숫자는 AI가 생성하지 않고 시스템 기본값을 넣는다.

OpenAI 공식 문서상 Structured Outputs는 제공한 JSON Schema 준수를 위한 기능이며, GPT Image는 정밀한 텍스트 배치와 여러 이미지 간 일관성에 한계가 있다. 이 때문에 정형 JSON과 결정적 렌더러를 핵심 구조로 사용한다.

## 8. 실패 처리

- OpenAI timeout: 입력 보존, 한 번 재시도, 데모 결과 열기
- 스키마 오류: 서버 검증 실패로 처리하고 한 번 재시도
- 이미지 생성 실패: CSS/SVG 기본 배경 유지
- DB 저장 실패: 로컬 초안을 유지하고 공개 실패를 명시
- 신호 중복: 최초 응답을 유지하고 이미 참여했다는 상태 표시
- PNG export 실패: 문제 장만 재시도하고 개별 다운로드 제공
- 공개 URL 실패: `/p/demo`와 사전 캡처 영상으로 발표 지속
- 긴 문구: UI에서 잘라 숨기지 않고 스키마 오류 또는 편집 안내

## 9. 팀 분업

현재 확인된 제작 인력은 개발자 2명과 디자이너 1명이다. 이름은 시작할 때 역할에 매핑한다.

### 개발자 A: 제품 화면과 통합

- 앱 scaffold와 디자인 토큰 적용
- `/`, `/studio/[id]` 화면
- 폼 상태와 localStorage
- 재사용 가능한 랜딩·캐러셀 결정적 렌더러
- 스튜디오 미리보기, 공개 랜딩의 표현 컴포넌트, `Meta 게시 준비`·승인·결과 UI
- 동일 렌더러 기반 PNG/ZIP export
- 로딩·빈 상태·오류·데모 fallback UI
- 최종 E2E 흐름과 Vercel 앱 배포 책임

소유 경로 예시: `app/page.tsx`, `app/studio/`, `components/`, `lib/export/`, `tests/e2e/`, 전역 스타일과 앱 scaffold.

### 개발자 B: 계약, AI, 공개·측정

- `CampaignSpec` Zod 계약과 데모 fixture
- OpenAI 생성 route와 프롬프트
- Supabase migration과 서버 접근
- 게시·조회·익명 신호·집계·다음 판단 API
- `/p/[slug]`의 데이터 로딩과 상태 처리 wrapper
- fixture·OpenAI·Supabase adapter와 단위 테스트
- 향후 Meta OAuth·token·광고 쓰기·Insights를 담당하는 server-only provider

소유 경로 예시: `lib/contracts/`, `lib/ai/`, `lib/db/`, `lib/demo/`, `app/api/`, `app/p/`, `supabase/`, `tests/unit/`.

개발자 A는 OpenAI, Supabase, Meta를 브라우저에서 직접 호출하지 않고 개발자 B가 제공한 내부 API만 사용한다. 개발자 B는 공개 랜딩이나 캐러셀 HTML을 별도로 만들지 않는다. `/p/[slug]`는 데이터를 불러온 뒤 개발자 A의 `LandingRenderer(spec)`를 그대로 사용하며, PNG/ZIP도 같은 렌더러를 사용한다.

### 디자이너: 제품 시스템과 발표 증거

디자이너는 마지막에 화면을 꾸미는 역할이 아니다. 다음 산출물을 순서대로 책임진다.

1. 30분 안에 제품명 후보 3개와 한 문장 톤 제안
2. 90분 안에 색, 타이포, 여백, radius를 포함한 토큰 확정
3. 랜딩페이지 한 템플릿과 캐러셀 5장 레이아웃 확정
4. 개발자가 바로 옮길 수 있는 실제 문구 길이의 Figma 프레임 제공
5. 생성 중, 빈 상태, 오류, 사실 확인 경고 상태 디자인
6. 구현 화면을 2회 QA하고 우선순위별 수정 목록 전달
7. `before/after` 업무 흐름, 제품 데모, 사람이 되찾은 판단을 중심으로 발표 자료 제작
8. 데모용 샘플 캠페인의 시각 자산과 백업 영상 구성

디자인은 한 가지 강한 방향만 구현한다. 테마 선택기나 자유 편집기는 만들지 않는다.

그 외 팀원이 있다면 실제 사용자 인터뷰, 현재 업무 단계 측정, 발표 스토리, 비즈니스 모델과 현장 규정 확인을 맡긴다. 개발자와 디자이너가 이를 동시에 떠안지 않는다.

### 병합 규칙

- `CampaignSpec`과 mock fixture를 먼저 합의한다.
- 서로의 소유 경로를 동시에 수정하지 않는다.
- 외부 API가 없어도 개발할 수 있도록 양쪽 모두 동일한 fixture를 사용한다.
- 2~3시간마다 짧게 통합하고 마지막에 한꺼번에 합치지 않는다.
- main은 항상 실행 가능하게 유지하고 기능 플래그 뒤에서 미완성 기능을 연결한다.

## 10. 구현 순서와 상대 일정

외부 API를 먼저 연결하지 않는다. 핵심 의존 순서는 다음으로 고정한다.

`CampaignSpec·fixture → 결정적 렌더러 → 외부 API 없는 종단 흐름 → Supabase 공개·응답 → OpenAI adapter → 안정화 → 선택적 Meta P1`

### 0단계: 30~45분 공동 계약

- 두 개발자가 제품명 임시안, 실제 데모 입력 1개, `CampaignSpec`, 문구 길이와 렌더링 매핑을 합의한다.
- 개발자 B가 Zod 계약과 완성된 fixture의 유일한 작성자가 된다.
- 개발자 A가 저장소와 Next.js scaffold를 초기화하고 첫 실행 가능한 기준점을 만든다.
- 완료 게이트 G0: fixture가 Zod 검증을 통과하고 랜딩·캐러셀에 필요한 값이 모두 존재한다.

### 1단계: 구현 시작 후 2시간

| 개발자 A | 개발자 B |
| --- | --- |
| Next.js 앱, 디자인 토큰, `/`, `/studio/[id]`, `LandingRenderer`, `CarouselRenderer`, localStorage 초안 | `CampaignSpec`, `demoCampaign`, generator·repository 인터페이스, 외부 키가 필요 없는 fixture adapter와 단위 테스트 |

- Supabase와 OpenAI 계정·키 사용 가능 여부만 확인하되 아직 핵심 흐름에 연결하지 않는다.
- Vercel 연결은 이 단계에 시작해 코드 배포 경로를 일찍 확인한다.
- 완료 게이트 G1: 같은 fixture가 스튜디오, 랜딩 미리보기와 캐러셀 5장을 모두 렌더링한다.

### 2단계: 이후 4시간, 첫 종단 데모

| 개발자 A | 개발자 B |
| --- | --- |
| 공개 랜딩 표현 컴포넌트, 응답 모달, 판단 화면, `Meta 게시 준비`, PNG/ZIP | fixture 기반 게시·slug·응답·집계·다음 판단 adapter와 API 형태 고정 |

- 완료 게이트 G2: 외부 API와 실제 계정 없이 `/ → studio → publish → /p/demo → 응답 → 결과 → 사람의 판단 → PNG/ZIP`이 끝까지 작동한다.
- 실제 OpenAI 없이도 완성된 흐름을 Vercel preview에 올리고 디자이너 1차 QA를 받는다.
- G2가 끝나기 전에는 Meta OAuth나 광고 객체 생성을 시작하지 않는다.

### 3단계: Supabase 공개·응답 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 내부 API 연결, 게시·중복·실패 상태, 실제 slug 표시와 결과 갱신 | migration, server-only repository, 캠페인 게시·조회, 익명 신호·집계·다음 판단 API |

- 완료 게이트 G3: 게시 후 실제 `/p/[slug]`가 발급되고 시크릿 창의 응답 한 건이 스튜디오 판단 화면에 반영되며 새로고침 뒤 다음 행동이 유지된다.

### 4단계: OpenAI adapter 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 생성 중·재시도·검토 경고·데모 결과 전환 UI | Responses API Structured Outputs, Zod 재검증, 한 번 재시도, prompt version과 fixture fallback |

- 완료 게이트 G4: 실제 입력 3종이 유효한 `CampaignSpec`을 만들고, 네트워크·스키마 실패 시 입력을 잃지 않은 채 데모 흐름으로 전환된다.
- AI 연결을 위해 렌더러나 화면별 상태 계약을 바꾸지 않는다. 문제가 생기면 adapter 경계를 먼저 수정한다.

### 5단계: 기능 동결과 검증

- 입력·로딩·오류·중복 응답·긴 문구·모바일 상태를 완성한다.
- 자동 검증 전체와 375px 모바일, 발표 노트북, 시크릿 창 smoke test를 수행한다.
- 데모 데이터, 공개 URL, QR, 백업 영상과 `before/after` 실제 단계 수를 준비한다.

### 발표 6시간 전

- 기능을 동결하고 P1을 전부 중단한다.
- 실제 입력 3종 회귀 테스트와 OpenAI·DB 각각의 실패 리허설을 수행한다.
- 비밀정보, debug UI와 검증되지 않은 후기·수치를 제거한다.

### 발표 2시간 전

- P0 데모를 막는 버그만 수정한다.
- 동일 발표자 기준 최소 3회 리허설하고 네트워크 차단 상태를 한 번 포함한다.

## 11. 검증 게이트

최소 자동 검증:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- 개발 검증용 E2E 도구로 fixture 기반 `/ → studio → publish → signal → 판단 → ZIP` 핵심 흐름 1개. 발표 자동 클릭 기능은 만들지 않는다.

수동 검증:

- 375px 모바일과 발표 노트북 해상도
- 한글 줄바꿈, 5장 PNG 1080×1350, ZIP 파일명
- 시크릿 창에서 공개 URL, 선택형 응답, 판단 화면
- 새로고침 후 초안 복구
- API 키가 브라우저, 로그, 저장소에 나타나지 않음
- OpenAI·DB를 각각 끈 상태에서 실패 안내와 데모 fallback
- 랜딩과 카드의 고객·문제·CTA 일치
- `Meta 게시 준비`의 문구·CTA·대상 고객·destination이 동일 spec과 공개 URL에서 파생됨
- 랜딩과 캐러셀에 근거 없는 후기·수치·인증이 없음

## 12. 3분 데모 시나리오

1. 20초: 아이디어는 있지만 캠페인 제작 때문에 검증을 미루는 예비창업가 또는 초기 1인 사업자를 보여준다.
2. 20초: 기존 도구와 수작업 단계를 한 화면에 보여준다.
3. 30초: 아이디어 한 줄을 입력하고 AI가 고정한 검증 가설을 확인한다.
4. 45초: 같은 메시지로 만들어진 랜딩과 캐러셀을 오가고 핵심 문구 한 번의 수정이 함께 반영됨을 보여준다.
5. 35초: 공개 랜딩을 다른 창 또는 휴대폰으로 열어 선택형 관심 질문에 실제로 응답한다.
6. 20초: 스튜디오에서 응답 증가와 사전 기준을 확인한 뒤, 사람이 `계속 검증`을 선택하고 PNG ZIP을 내려받는다.
7. 10초: “콘텐츠를 만든 것이 아니라, 고객을 만나기 전까지의 제작 업무를 없앴다”로 닫는다.

발표에서 시장 검증 완료, 매출 증가, 전환 개선을 주장하지 않는다. 실제로 보여준 공개·선택형 응답·다운로드와 구현 후 측정한 수동 단계만 말한다.

## 13. 공식 기술 근거

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js layouts and dynamic segments](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Image Generation](https://developers.openai.com/api/docs/guides/image-generation)
- [Supabase Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase JSON data](https://supabase.com/docs/guides/database/json)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [`html-to-image`](https://github.com/bubkoo/html-to-image)
