# marketvalley 해커톤 MVP 스펙

상태: 계정별 production lifecycle 구현 완료, 운영 migration·배포 대기
마지막 갱신: 2026-08-26
목표: 별도 랜딩 저장소의 시각 요소와 디자인 담당자의 메인 웹사이트 디자인을 반영해 2026 UNITHON 발표용 종단 흐름을 구현한다. 구조와 기능은 이 스펙을 따른다.

현재 제품 경로는 Google 계정별 Supabase 캠페인을 먼저 접수하고 영속 worker가 Claude 문구, 공개 랜딩, 카드뉴스, Meta 광고 생성·활성화, Insights 수집, 최종 리포트를 순서대로 처리한다. 브라우저를 닫아도 진행되며 다시 로그인하면 저장된 현재 단계가 열린다. fixture는 seed 없이 자동 테스트에서만 명시한다.

## 1. 우승 전략

심사에서 보여줄 것은 생성 기능의 개수가 아니다. 아이디어가 실제 관심 신호로 이어지기 전 존재하던 기획, 재작성, 조판, 배포, 취합 업무가 하나의 흐름에서 사라졌다는 점이다.

발표의 제품 문장은 다음으로 고정한다.

> 아이디어 하나만 남기세요. 첫 시장 반응을 얻기 전까지의 제작 업무는 marketvalley가 지웁니다.

제품은 `배경·솔루션 입력 → 광고 자동 구성·게시 → 공개·내보내기 → 동의 기반 예약 회수 → 사람의 다음 판단`이라는 한 경로만 깊게 완성한다. 자유도, 채널 수, 템플릿 수보다 메시지 일관성, 실제 URL, 실제 예약 한 건, 시각적 완성도와 실패 복구를 우선한다.

내부 데이터 계약과 route는 기존 `CampaignSpec`, `/campaigns/[id]` 이름을 유지한다. 사용자에게 보이는 제품 문구에서는 이 내부 이름을 노출하지 않고 결과 단위를 `광고` 또는 `광고 초안`이라고 부른다.

## 2. P0 범위

P0는 하나라도 빠지면 발표용 제품이 완성되지 않은 것으로 본다.

### P0-1. 아이디어 입력

화면 `/new`에서 다음을 순서대로 받는다.

- 필수 1단계: 제품을 만들게 된 배경, 20~600자
- 필수 2단계: 제공할 솔루션, 20~500자

상품명과 핵심 특징이 정해져 있다면 2단계 솔루션에 함께 적는다. mock 생성기는 명시된 값을 결정적으로 추출하고, live 생성기는 같은 정보를 Structured Outputs로 구성한다. 별도 입력 단계를 늘리지 않는다.

generator가 추론한 내용은 `assumptions`에 표시한다. 제출 버튼을 연속 클릭할 수 없게 하고, 오류가 나면 현재 입력을 보존한다.

완료 기준:

- Supabase Auth가 설정된 제품 환경에서는 광고 생성 CTA가 입력 전에 `/login?next=/new`를 현재 화면 위 모달로 열고, 직접 `/new`에 접근한 비로그인 사용자는 전용 로그인 화면으로 보낸다. Google 로그인 뒤에는 `/new`로 복귀시킨다.
- Supabase가 미설정된 자동 테스트·비상 발표 fixture는 외부 인증 장애와 무관하게 입력 흐름을 유지한다.
- 1단계에서 2단계로 이동하면 브라우저 history에 입력 단계를 남기고, 뒤로·앞으로와 화면의 `이전` 버튼에서 작성한 값을 보존한 채 해당 단계로 복원한다.
- 필수값 검증과 오류 문구가 있다.
- 제품 화면에 예시 자동 입력이나 더미 프로젝트를 제공하지 않는다.
- 사용자가 입력한 상품명과 핵심 특징이 생성된 `CampaignSpec`, 랜딩과 캐러셀에 같은 값으로 나타난다.
- 모바일과 노트북 화면에서 주요 CTA가 보인다.

### P0-2. 검증 가설 및 광고 생성

서버에서 Anthropic Messages API와 Structured Outputs를 사용해 한 번에 평면 문구 슬롯 JSON을 생성한다. 서버가 Figma·안전·판단 기준 필드와 합쳐 단일 `CampaignSpec`을 만들고 전체 Zod 계약으로 다시 검증한다. 자유 형식 텍스트를 파싱하지 않는다.

Figma가 정의한 레이아웃, 타이포·색상 조합, 섹션 순서와 상태·개인정보·사람 판단 안내는 renderer에 고정한다. AI는 아래 문구 슬롯만 채우고 새 HTML·좌표·템플릿을 만들지 않는다.

| 생성 그룹 | 생성 대상 | 핵심 지시 |
| --- | --- | --- |
| 상품·가설 | `project`, `validation`의 고객·문제·해결·가정 | 입력 사실과 추론을 분리하고 관찰 가능한 관심 신호로 쓴다. |
| 핵심 메시지 | `valueProposition`, `hooks[0..2]` | 반복 순간, 사라지는 일, 사람이 되찾는 판단의 서로 다른 세 각도를 사용한다. |
| 게시 문구 | `caption`, `hashtags` | 랜딩과 같은 고객·문제·특징·CTA를 유지한다. |
| 랜딩 | Hero·문제·가치·3단계·FAQ | 섹션 목적과 Figma 글자 길이에 맞추고 입력에 없는 정책·효능을 만들지 않는다. |
| 캐러셀 | Hook·Problem·Insight·Solution·CTA | 5장 흐름을 유지하고 랜딩 source field와 같은 의미를 더 짧게 쓴다. |
| 선택적 배경 | `visualPrompts[0..4]` | 글자·로고·UI가 없는 장면 설명만 만든다. |
| 안전 검토 | `claimsToReview`, `prohibitedClaimsRemoved` | 확인할 주장과 생성에서 제외한 금지 주장을 구분한다. |

각 그룹의 지시는 `lib/ai/campaignPrompts.ts`에서 하나의 developer prompt로 조합한다. 사용자 입력은 별도 user message의 JSON 자료로 전달하고 그 안의 지시문을 실행하지 않는다. 랜딩·캐러셀·Meta를 따로 호출하지 않고 필요한 문구 슬롯을 한 번에 생성한 뒤 서버에서 전체 `CampaignSpec`으로 조립한다.

완료 기준:

- Zod 스키마 검증을 통과한 결과만 저장한다.
- 타깃, 문제, 해결, 기대 신호, 반증 조건이 각각 한 문장으로 나온다.
- 공개 CTA는 서버가 고정한 사전예약 문구를 사용하고 이름·이메일·동의 폼으로 이어진다.
- 이 가설을 약화시키는 관찰 결과가 `invalidationEvidence` 한 문장으로 나온다.
- 판단 기준은 모델이 임의로 만들지 않고 시스템 기본 최소 표본 5명을 사용하며 리포트에서 실제 예약자 수와 함께 표시한다. `minimumPositiveResponses`는 v2 호환 필드일 뿐 현재 예약자 리포트나 자동 판정에는 사용하지 않는다.
- `schemaVersion`, 생성 모델·시각, Figma 색상, 판단 기준, 캠페인 ID·slug·공개 URL과 실제 예약은 서버가 기록하거나 모델 결과 위에 덮어쓴다.
- 확인되지 않은 숫자, 고객 후기, 인증, 효능을 만들어내지 않는다.
- 사실 검토가 필요한 표현은 `claimsToReview`에 별도로 표시한다.
- 빈 구조화 응답을 포함한 전송·timeout·스키마 오류는 입력과 접수 기록을 유지하고 제한된 횟수만 자동 재시도한다. 실패를 fixture 성공으로 바꾸지 않는다.

### P0-3. 광고 생성과 게시

별도 가설 승인 화면은 두지 않는다. `/new`의 두 번째 입력을 제출하면 DB 접수를 완료한 뒤 `/campaigns/[id]/progress`에서 `접수 → 준비 중 → 수집 중 → 결과 도착`을 실제 상태로 표시한다. 랜딩·카드뉴스·Meta 객체 생성과 ACTIVE 확인이 끝나야 수집 중으로, 종료 뒤 최종 Insights snapshot이 저장돼야 결과 도착으로 이동한다.

랜딩, 캐러셀과 Meta용 사전 확인 화면은 만들지 않는다. 실제 랜딩은 발급된 공개 URL에서 확인하고, 캐러셀은 내려받은 PNG·ZIP이 최종 결과물이다. 내용을 바꾸려면 `/new`로 돌아가 새 광고를 생성한다.

완료 기준:

- 두 번째 입력 제출 전에는 공개 snapshot이나 다운로드 파일을 만들지 않는다.
- 생성·게시 요청은 중복 실행되지 않으며 실패를 성공으로 표시하지 않고 입력을 보존한다.
- 미구현 단계와 실제 실행 단계를 화면 문구로 구분하며 실제 API가 끝나기 전에 완료 상태를 표시하지 않는다.
- 진행 화면에서 이탈하거나 브라우저를 닫아도 서버 worker가 작업을 이어가며, 로그인 뒤 계정 소유 상태를 다시 불러온다.
- `/campaigns/[id]`는 실제 공개 URL, PNG·ZIP 다운로드, 게시 문구 복사, 예약자 수·접수 추이, 사전 기준과 사람의 다음 행동만 제공한다.
- 결과 화면은 현재 예약자 수가 사전 최소 표본에 충분한지 사실만 보여주고, `계속 검증`, `메시지 수정`, `보류` 선택은 사용자가 한다.
- 선택한 다음 행동은 저장되어 새로고침 뒤에도 유지된다.

### P0-4. 공개 랜딩페이지

화면 `/p/[slug]`는 게시된 `CampaignSpec` snapshot으로 렌더링된다.

고정 섹션:

1. Figma 고정 도입부 템플릿과 Hero CTA
2. 고객의 문제 3개
3. 제안 가치 3개
4. 작동 방식 3단계
5. FAQ 3개
6. 마지막 CTA

`CampaignSpec.templates.landingIntro`가 Figma의 고정 도입부 `intro-1`부터 `intro-7` 중 하나를 선택한다. 선택된 레이아웃만 달라지고 이후 섹션, CTA 질문과 응답 계약은 모두 같은 렌더러를 재사용한다. 자유 배치나 임의 HTML 생성은 하지 않는다.

CTA를 누르면 이름·이메일과 개인정보 동의 체크박스를 받는 예약자명단 폼을 보여준다. 제출된 답은 `campaign_reservations`로 기록한다. 이 절은 ADR-0013로 갱신됐다 — 이전에는 긍정·중립·부정 익명 응답을 받고 개인정보를 받지 않았으나, 지금은 이름·이메일을 받는 예약자명단 모델을 채택한다.

완료 기준:

- 공개 URL을 시크릿 브라우저와 모바일 뷰포트에서 열 수 있다.
- 이름·이메일·동의가 모두 유효해야 접수되고 완료 피드백을 받는다.
- 같은 캠페인의 같은 이메일은 중복 접수되지 않으며 실제 예약자 수·목록·접수 추이가 `/campaigns/[id]` 결과 화면에 반영된다.
- 랜딩 HTML에 `undefined`, 잘린 핵심 문구, 빈 필수 섹션이 없다.

### P0-5. 인스타그램 캐러셀과 실제 광고 집행

캐러셀은 1080×1350 비율의 5장으로 고정한다.

1. Hook
2. Problem
3. Insight
4. Solution
5. CTA

첫 번째 Hook 장은 `CampaignSpec.templates.carouselCover`에 따라 Figma 표지 `cover-31`, `cover-32`, `cover-34` 중 하나를 사용한다. 나머지 네 장은 같은 5장 메시지 흐름 안에서 선택된 표지의 사진·흑백·보라 강조·타이포 규칙을 이어 결정적으로 조판한다.

AI는 문구와 선택적 배경 이미지 프롬프트만 만든다. 모든 텍스트는 디자이너가 정의한 React/CSS 템플릿으로 조판한다.

서버는 `CampaignSpec`과 게시된 랜딩 URL에서 캐러셀 5장, 기본 문구, headline, CTA와 destination URL을 조합해 Meta 광고를 만든다. 운영자 UUID, 정확한 광고 계정과 고정 lifetime 예산 확인값이 모두 일치할 때만 활성화한다. 최종 리포트의 수동 초안·활성화·중지 버튼과 공개 수동 Meta API는 제공하지 않는다.

완료 기준:

- 내려받은 PNG의 줄바꿈·글꼴·여백이 정해진 템플릿과 일치한다.
- 모든 장을 개별 PNG 또는 하나의 ZIP으로 받을 수 있다.
- 파일명은 `01-hook.png`부터 `05-cta.png`까지 정렬된다.
- 캡션, 후킹 문구 3개, CTA, 해시태그를 복사할 수 있다.
- 광고에 업로드한 서버 PNG와 리포트 미리보기·ZIP의 서버 PNG가 같은 endpoint 결과다.
- 예산, 통화, 기간과 타기팅은 서버 정책으로 고정하며 AI가 임의로 변경하지 않는다.
- 각 광고는 서버가 승인한 고정 lifetime 예산과 종료 시각을 독립적으로 적용하며, 여러 검증을 동시에 수집할 수 있다.
- 이미지 생성 API 없이도 완성된 기본 시각 결과가 나온다.

### P0-6. 결정적 테스트 fixture

fixture는 자동 테스트가 외부 과금 없이 같은 API 경계와 렌더러를 확인하기 위한 전용 adapter다. 제품 기본값은 Supabase·Anthropic이며 fixture repository는 명시해도 기본 seed를 넣지 않는다.

완료 기준:

- fixture도 사용자가 실제로 입력·접수한 캠페인만 목록에 보인다.
- fixture 성공을 live 장애의 fallback으로 자동 사용하지 않는다.

## 3. 자동 집행 안전 경계

- 선택한 카드 또는 Hero의 텍스트 없는 배경 이미지 1장 생성
- 특정 필드 AI 재작성
- 캠페인 QR 코드
- 페이지 조회와 응답의 단순 전환율
- 공유용 Open Graph 이미지
- Meta 자격증명은 서버에만 두고 브라우저 route나 번들로 전달하지 않는다.
- 운영자 Google 계정 UUID, 광고 계정 ID, lifetime 예산이 배포 설정의 확인값과 모두 일치해야 활성화한다.
- 운영자·광고계정·캠페인별 lifetime 예산을 실행 직전에 다시 확인하며 계정 전체 직렬화는 하지 않는다.
- 생성은 PAUSED 객체로 시작하고 자식부터 부모 순서로 활성화하며, 일부 실패 시 부모부터 전체를 PAUSED로 복구한다.
- 수집 종료 시 부모부터 전체를 PAUSED로 확인한 뒤 최종 Insights 반영 시간을 기다린다.
- 자동 예산 증액, 종료 뒤 재시작, 결제수단 등록은 구현하지 않는다.

상세 결정은 `docs/decisions/0023-run-account-owned-campaigns-as-a-durable-automatic-lifecycle.md`와 동시 집행 경계를 갱신한 `docs/decisions/0024-allow-concurrent-bounded-meta-runs.md`를 따른다.

다음 기능은 시작하지 않는다.

- 결제수단 등록, 무인 예산 증액·종료 뒤 재시작
- Instagram 일반 게시물 자동 업로드
- 드래그 앤 드롭 페이지 빌더
- 팀 협업, 결제
- 두 번째 랜딩 또는 캐러셀 디자인 테마
- 범용 리서치 에이전트와 경쟁사 크롤러
- 자동 A/B 승자 판정

P1 때문에 P0 통합이나 발표 준비가 1시간 이상 밀리면 즉시 P1을 제거한다.

## 4. 화면 기능 명세

아래 내용은 화면의 기능과 상태 요구사항만 정의한다. 배치, 색상, 타이포그래피와 컴포넌트 외형은 디자인 담당자의 확정본을 따르며 이 문서의 설명을 시각 참고자료로 사용하지 않는다.

### `/`

- 전체 프로젝트 대시보드와 상태 필터
- 로그인 계정이 소유한 실제 프로젝트만 표시
- 비로그인·빈 목록·오류 상태를 더미 카드 없이 표시
- 확인창을 거쳐 소유 프로젝트를 개별 삭제하되 처리 중이거나 실제 광고가 ACTIVE인 프로젝트는 차단
- `/new`로 이동하는 `새 광고` CTA
- 제품이 없애는 기존 작업을 짧은 `before/after`로 표시

### `/new`

- 제품 배경과 솔루션을 각각 받는 2단계 입력
- 각 단계 20자 이상 검증
- `이전`, `다음`, `광고 만들기` 제공
- 처리 중 중복 실행 차단, 실패 안내와 입력 보존
- 접수 응답 뒤 진행 URL로 이동하고 `접수 → 카드뉴스·랜딩·광고 준비 중 → 실제 시장 데이터 수집 중 → 결과 도착`을 표시
- AI 생성·광고 ACTIVE·최종 집계가 각기 실제 완료된 상태만 표시

### `/campaigns/[id]/progress`

- DB lifecycle을 15초마다 갱신하고 focus·재로그인 때 즉시 복원
- 완료 전에는 메인 이동 버튼이나 리포트 CTA를 표시하지 않음

### `/campaigns/[id]`

- 실제 수집이 끝난 캠페인만 접근
- 최종 Meta Insights, 랜딩 방문·예약 데이터와 실제 공개 URL
- 실제 광고와 같은 서버 렌더 캐러셀 PNG·ZIP 다운로드
- 실제 예약자 수·접수 추이, 사전 기준과 표본 부족 상태
- `계속 검증`, `메시지 수정`, `보류` 중 사람의 다음 행동 저장
- 수동 Meta 초안·활성화·중지 제어를 표시하지 않음

### `/p/[slug]`

- 모바일 우선 랜딩페이지
- 동일 CTA를 Hero와 마지막 섹션에 배치
- CTA 뒤 이름·이메일·동의 예약 폼과 접수 성공·이메일 중복 상태 표시
- marketvalley 브랜드는 작은 `Made with` 수준으로만 노출

## 5. 데이터 계약

`CampaignSpec`은 제품의 단일 진실 공급원이다. UI마다 별도 카피 상태를 만들지 않는다.

```ts
type CampaignSpec = {
  schemaVersion: "2";
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
  templates: {
    carouselCover: "cover-31" | "cover-32" | "cover-34";
    landingIntro: "intro-1" | "intro-2" | "intro-3" | "intro-4" | "intro-5" | "intro-6" | "intro-7";
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

### 공유 문구 생성 매핑

중복 저장된 문자열을 찾아 바꾸는 방식은 사용하지 않는다. 렌더러가 아래 source field를 직접 참조한다.

| Source field | 랜딩 사용처 | 캐러셀 사용처 |
| --- | --- | --- |
| `project.name` | Header와 Figma 상품명 슬롯 | 1장 Hook 문구와 모든 장 footer |
| `project.oneLiner` | 한 줄 특징·설명 슬롯 | 1장 보조 문구 생성 근거 |
| `landing.benefits[].title` | 특징 키워드와 가치 3개 | 3·4장 Insight·Solution 문구 |
| `messaging.valueProposition` | 상품 메인 아웃풋 슬롯 | 1·4장 핵심 문구 |
| `messaging.hooks[0]` | SEO 설명 보조 | 1장 Hook headline |
| `validation.signal.ctaLabel` | 예약 폼 고정 CTA의 export 호환 문구 | 5장 CTA headline |
| `carousel.ctaBody` | 예약 폼 참여 이유 보조 | 5장 CTA body |

Meta 광고도 별도 문구 상태를 만들지 않는다. 기본 문구는 `messaging.caption`, headline은 `messaging.hooks[0]`, CTA는 `validation.signal.ctaLabel`, 대상 고객 가설은 `validation.customer`, destination은 게시 결과에서 만든 절대 공개 URL을 사용한다. 실제 업로드는 화면·다운로드와 같은 서버 PNG 5장을 사용한다.

`landing.hero`와 `carousel`은 위 문구를 별도 복제하지 않는다. 게시된 `CampaignSpec`은 snapshot과 내보내기 입력으로 고정하며, 내용을 바꾸려면 새 캠페인을 생성한다.

고정 renderer와 AI 생성 슬롯의 상세 소유 경계, 후킹 3종의 역할과 프롬프트 조합 방식은 [ADR-0011](decisions/0011-separate-fixed-figma-copy-and-ai-slots.md)을 따른다.

## 6. 기술 구조

### 선택 스택

- Next.js App Router, TypeScript, React/CSS 결정적 렌더러
- Zod
- Anthropic TypeScript SDK와 Messages API Structured Outputs
- 제품 생성 기본값은 `anthropic`. 자동 테스트와 비상 발표 fallback만 외부 호출이 없는 `fixture`를 명시하며, 기본 `claude-sonnet-4-6`은 `ANTHROPIC_TEXT_MODEL`로 교체 가능
- 개발·발표에서는 이미지 모델도 비활성화하고 검증된 reference 자산과 결정적 renderer만 사용
- Supabase Postgres
- Next.js `ImageResponse` 서버 PNG와 JSZip
- Oracle Compute의 Next.js standalone·Docker Compose·Caddy HTTPS 배포
- Vitest 단위 테스트와 Playwright production E2E
- 패키지 관리자는 `pnpm`

별도 백엔드 애플리케이션, 메시지 큐, 워커와 벡터 데이터베이스는 사용하지 않는다. Next.js 앱과 reverse proxy만 두 컨테이너로 실행한다.

### 배포 모델

Oracle Compute VM에는 marketvalley Next.js 애플리케이션 하나와 Caddy reverse proxy를 배포한다. 사용자가 캠페인을 공개할 때마다 별도 서버나 프로젝트를 만들거나 다시 배포하지 않는다. `POST /api/campaigns`가 Supabase의 캠페인 row와 slug를 생성하면 이미 배포된 동적 경로 `/p/[slug]`가 그 snapshot을 읽어 즉시 공개한다.

따라서 제품 용어를 다음처럼 구분한다.

- `앱 배포`: 검증된 Git SHA를 Oracle VM의 실행 이미지로 전환하는 행위
- `캠페인 게시`: 사용자가 현재 `CampaignSpec` snapshot을 저장하고 공개 URL을 발급받는 행위

캠페인 게시 성공을 앱 배포 성공으로 표현하지 않는다. 공개 페이지는 승인 당시 snapshot을 사용하며 게시 뒤에는 내용을 바꾸지 않는다. 메시지를 수정하려면 기존 입력을 불러와 새 캠페인을 생성한다.

### 계획된 디렉터리 경계

```text
app/
  page.tsx
  new/page.tsx
  campaigns/[id]/progress/page.tsx
  campaigns/[id]/page.tsx
  campaigns/[id]/presentation/page.tsx
  p/[slug]/page.tsx
  api/campaigns/route.ts
  api/campaigns/lifecycle/route.ts
  api/campaigns/[id]/cards/[index]/route.tsx
  api/internal/lifecycle/route.ts
  api/analytics/visits/route.ts
  api/reservations/route.ts
components/
  campaign-wizard.tsx
  campaign-report.tsx
  progress-view.tsx
  renderers/public-landing.tsx
  renderers/carousel-card.tsx
lib/
  contracts/campaign.ts
  contracts/repository.ts
  lifecycle/campaignLifecycleProcessor.ts
  lifecycle/campaignLifecycleStore.ts
  meta/
  supabase/
supabase/migrations/
tests/unit/
tests/e2e/
```

`lib/contracts/campaign.ts`는 두 개발자가 함께 합의한 뒤 한 명만 소유한다. 랜딩과 캐러셀 렌더러는 API를 직접 호출하지 않는다.

### API 경계

- `POST /api/campaigns`: 2단계 입력과 client 생성 `draftId`를 검증해 계정 소유 접수를 먼저 저장하고 lifecycle ID를 반환한다. 같은 `draftId`와 입력의 재요청은 같은 캠페인을 반환한다.
- `GET /api/campaigns/lifecycle`: 로그인 계정의 캠페인 목록 또는 한 캠페인의 현재 상태를 반환한다.
- `GET /api/internal/lifecycle`: 32바이트 이상 Bearer secret으로만 worker가 호출하며 due campaign을 lease로 claim해 다음 외부 작업을 수행한다.
- `GET /api/campaigns?id=...`: 로그인한 소유자에게 완성된 spec, 공개 slug, 실제 analytics와 예약자명단을 반환한다. ID가 없으면 계정의 lifecycle 목록을 반환한다.
- `GET /api/campaigns/[id]/cards/[index]`: 같은 서버 renderer로 1080×1350 PNG 한 장을 반환한다.
- `POST /api/reservations`: `{ campaignId, name, email, consent, utm? }`를 검증해 동의된 예약 한 건을 기록한다. fixture는 `(campaignId, email)` hash, live는 서버 HMAC email hash와 DB unique constraint로 중복을 막는다.
- `PATCH /api/campaigns`: `{ campaignId, draftId, nextAction }`을 받아 소유 draft가 맞을 때만 사람의 선택 `continue`, `revise`, `pause`를 저장한다.
- `DELETE /api/campaigns?id=...&draftId=...`: 소유권과 row lock을 확인한다. worker lease가 없고 Meta run이 없거나 DB와 Meta Graph의 campaign·ad set·ad가 모두 `PAUSED`일 때만 프로젝트와 종속 예약·집계 데이터를 삭제한다. 불확실한 외부 operation·Graph 응답이나 실제 광고가 남아 있으면 `409`로 차단한다.
- `POST /api/analytics/visits`: 공개 랜딩의 고유 방문을 privacy-preserving identifier로 집계한다.

모든 route handler에서 입력 크기와 Zod 스키마를 검사한다. `POST /api/reservations`는 동의가 없는 제출을 거절하고 같은 캠페인의 같은 이메일 중복을 `alreadyReserved` 결과로 변환한다. 원문 이메일은 소유자 조회에만 사용하고 목록 화면에는 마스킹한다. Anthropic 키와 Supabase 서버 키는 클라이언트 번들에 포함하지 않는다.

### 데이터베이스

```text
campaigns
- id uuid primary key
- owner_id uuid not null references auth.users(id)
- draft_id text not null
- input_background / input_solution text
- lifecycle_status text not null
- slug text unique, spec jsonb, published_at timestamptz (생성 완료 뒤 채움)
- generation_attempts / stage_attempts / retry_from_status / next_attempt_at
- processing_token / processing_lease_until
- preparation_completed_at / collection_started_at / collection_ends_at / finalized_at
- last_error_code / last_error_message
- next_action text null check in ('continue', 'revise', 'pause')
- created_at timestamptz not null
- unique (owner_id, draft_id)

campaign_reservations
- id uuid primary key
- campaign_id uuid references campaigns(id) on delete cascade
- name text not null
- email text not null
- email_hash text not null
- consent_version text not null
- consented_at timestamptz not null
- utm_source text
- utm_medium text
- utm_campaign text
- utm_content text
- reserved_at timestamptz not null
- unique (campaign_id, email_hash)

generation_rate_limits / generation_daily_usage / generation_global_daily_usage
- 사용자 분당, 사용자 일일, 전체 일일 유료 AI 생성 요청 수
- service-role 전용 원자 RPC `consume_generation_quota`만 갱신

meta_ad_runs / meta_operation_ledgers / meta_insight_snapshots
- Meta 객체 ID·checkpoint·activation 상태와 실제 수집 구간
- 캠페인별 고정 lifetime 예산·수집 구간과 Meta 객체 상태
- 중간·최종 Insights snapshot과 fetch 시각
```

(ADR-0013으로 익명 신호를 이름·이메일 기반 `campaign_reservations`로 대체했다. ADR-0016으로
소유자 작업에는 `auth.uid()` RLS를 적용하고 공개 예약·분산 quota만 server-only client가 처리한다.)

`/new`의 입력은 단계 이동과 브라우저 뒤로·앞으로에서 유지된다. 제출하면 입력과 draft ID를 DB에 먼저 저장하므로 Claude나 Meta가 실패해도 아이디어 작성 단계로 되돌리지 않는다. 같은 입력의 재요청은 같은 계정·draft ID의 lifecycle을 반환하고 worker는 저장된 checkpoint에서 재개한다. 게시 시점의 spec만 snapshot이 되며 게시된 snapshot은 수정하지 않는다.

공개 페이지는 예약자명단 제출 시 이메일을 서버로 보낸다(ADR-0013). 중복 예약 방지는 `(campaignId, email)` 조합으로 판단하며, fixture는 원문을 남기지 않기 위해 무비밀 SHA-256을 사용한다. live Supabase adapter는 서버 전용 `SIGNAL_HASH_SECRET`으로 이메일 HMAC 해시(`email_hash`)를 만들어 dedupe에 쓰고, 원문 `email`은 소유자 화면·리스트 원본 조회용으로 별도 저장한다. 리스트 표시에는 마스킹된 이메일(`seon****@gmail.com` 형태)만 노출하고 공개 예약 응답에는 예약자 수나 목록을 반환하지 않는다. DB 접근은 서버에서만 수행하며 IP 주소와 원문 user-agent를 저장하지 않는다.

### 지표 정의 (ADR-0013로 갱신)

리포트는 저장된 Meta Insights, 고유 랜딩 방문, 예약 데이터와 사전 판단 기준만 수치로 표시한다. 디자인 시안의 임의 우상향 그래프나 고정 노출 수·CTR·업계 평균은 사용하지 않는다.

**실제 지표**

- 예약자 수: `campaign_reservations`에 실제로 기록된 행 수.
- 예약자 리스트: 이름과 마스킹된 이메일. 응답이 0이면 `아직 예약 없음`을 표시한다.
- 예약 접수 추이: 저장된 각 예약의 `reservedAt`을 시간순으로 정렬한 누적 건수. 운영 제품과 테스트 fixture 모두 기본 seed 없이 실제 제출 건만 집계한다.
- 판단 기준 대비 표본: 현재 예약자 수와 `decisionRule.minimumResponses`의 단순 비교. 시장성 자동 판정은 하지 않는다.
- Meta 노출·도달·클릭·링크 클릭·광고비: `meta_insight_snapshots`의 최신 또는 최종 행.
- 고유 랜딩 방문과 예약률: privacy-preserving 방문 기록과 예약 행에서 계산한다.

**표시하지 않는 지표**

- 체류시간·스크롤 깊이와 성별·연령·지역은 실제 breakdown 계측이 없어 표시하지 않는다.
- Meta 또는 방문 계측 전에는 값을 만들지 않고 `계측 연결 전` 또는 `집계 전` 상태를 표시한다.

실입금·결제 관련 지표(레퍼런스의 "실입금 사전예약")는 이번 스코프에서 구현하지 않는다.

### 외부 의존성 경계

Route Handler가 SDK를 직접 여기저기 호출하지 않도록 다음 인터페이스 뒤에 둔다.

```ts
interface CampaignGenerator {
  generate(input: IdeaInput): Promise<CampaignSpec>;
}

interface CampaignRepository {
  publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign>;
  getById(id: string): Promise<PublishedCampaign | null>;
  getBySlug(slug: string): Promise<PublishedCampaign | null>;
  recordReservation(input: ReservationInput): Promise<void>;
  getReservationSummary(campaignId: string): Promise<ReservationSummary>;
  saveNextAction(input: NextActionInput): Promise<NextAction>;
  delete(input: DeleteCampaignInput): Promise<void>;
}
```

실서비스는 Anthropic·Supabase adapter를, 자동 테스트는 fixture generator와 서버 프로세스 메모리 repository를 사용한다. 운영 브라우저에는 lifecycle 소유 토큰을 두지 않고 Google 세션과 RLS로 소유권을 확인한다. fixture도 생성, 게시, 공개 페이지 조회, 중복 예약, 예약자명단 조회와 판단까지 실제 Route Handler를 통과한다.

## 7. AI 생성 규칙

- 하나의 호출에서 전체 광고의 문구 슬롯과 허용된 선택자를 생성한다.
- 문법 복잡도를 제한한 평면 Structured Outputs 스키마와 최종 `CampaignSpec` Zod 검증을 함께 사용한다.
- 입력에 없는 수치, 후기, 수상, 인증, 효능, 가격을 발명하지 않는다.
- 실제 인터뷰 근거가 없는 베타테스터 후기, 고객 인용문, 사용 인원은 placeholder로도 만들지 않는다.
- 추론한 정보는 `assumptions`, 확인이 필요한 주장은 `claimsToReview`에 넣는다.
- 모델 결과를 HTML로 직접 실행하지 않는다. 모든 출력은 React 렌더러의 텍스트 데이터로만 사용한다.
- 프롬프트는 `promptVersion`을 가지며 결과와 함께 기록한다.
- live 생성은 Sonnet 대표 입력 실측 지연을 반영한 90초 timeout과 SDK·앱 재시도 0회로 제한해 timeout·빈 응답 뒤 중복 생성과 과금을 막는다.
- 이미지 모델은 글자, 로고, UI, 카드 완성본을 생성하지 않는다.
- 판단 기준의 숫자는 AI가 생성하지 않고 시스템 기본값을 넣는다.

Anthropic 공식 문서상 Structured Outputs는 제공한 JSON Schema 준수를 위한 기능이다. 이미지 생성은 이번 범위에서 사용하지 않으므로 정형 JSON과 결정적 렌더러를 핵심 구조로 사용한다.

## 8. 실패 처리

- Anthropic timeout: 자동 재호출 없이 입력을 보존하고 실패를 명시한다. live 성공을 fixture로 위장하지 않는다.
- Anthropic 문법 컴파일 오류: `campaign_generation_schema_error`로 일반 upstream 실패와 구분하고 입력을 보존한다.
- 모델 출력 스키마 오류: 서버 검증 실패로 처리하고 입력을 보존한 채 실패를 명시
- 이미지 생성 실패: CSS/SVG 기본 배경 유지
- 저장소 실패: 현재 입력과 lifecycle 상태를 유지하고 생성·게시·예약·판단 실패를 각각 명시
- 예약 중복: 최초 예약을 유지하고 이미 접수됐다는 상태 표시
- PNG export 실패: 실패 안내 뒤 브라우저 새로고침과 재시도를 제공하고, 발표에서는 사전 검증한 백업 ZIP으로 전환
- 공개 URL 실패: 같은 source SHA의 Oracle 배포와 사전 캡처 영상으로 발표 지속
- 긴 문구: UI에서 잘라 숨기지 않고 스키마 오류와 입력 수정·재생성 안내

## 9. 팀 분업

현재 확인된 제작 인력은 개발자 2명과 디자이너 1명이다. 이름은 시작할 때 역할에 매핑한다.

### 개발자 A: 제품 화면과 통합

- 앱 scaffold와 디자인 토큰 적용
- `/new` 2단계 입력·실제 생성 진행, `/campaigns/[id]/progress` 호환 화면과 `/campaigns/[id]` 결과 화면
- 폼 상태와 내부 API 연결
- 재사용 가능한 랜딩·캐러셀 결정적 렌더러
- 공개 랜딩의 표현 컴포넌트, 실제 Meta와 같은 PNG/ZIP export와 결과 UI
- 동일 렌더러 기반 PNG/ZIP export
- 로딩·빈 상태·오류·데모 fallback UI
- 최종 E2E 흐름과 Oracle 앱 배포 책임

소유 경로 예시: `app/page.tsx`, `app/campaigns/`, `components/`, `lib/export/`, `tests/e2e/`, 전역 스타일과 앱 scaffold.

### 개발자 B: 계약, AI, 공개·측정

- `CampaignSpec` Zod 계약과 데모 fixture
- Anthropic 생성 route와 프롬프트
- Supabase migration과 서버 접근
- 게시·조회·동의 기반 예약·예약자명단 집계·다음 판단 API
- `/p/[slug]`의 데이터 로딩과 상태 처리 wrapper
- fixture·Anthropic·Supabase adapter와 단위 테스트
- Meta token·광고 쓰기·Insights와 lifecycle을 담당하는 server-only provider

소유 경로 예시: `lib/contracts/`, `lib/ai/`, `lib/db/`, `lib/demo/`, `app/api/`, `app/p/`, `supabase/`, `tests/unit/`.

개발자 A는 Anthropic, Supabase, Meta를 브라우저에서 직접 호출하지 않고 개발자 B가 제공한 내부 API만 사용한다. 개발자 B는 공개 랜딩이나 캐러셀 HTML을 별도로 만들지 않는다. `/p/[slug]`는 데이터를 불러온 뒤 개발자 A의 `LandingRenderer(spec)`를 그대로 사용하며, PNG/ZIP도 같은 렌더러를 사용한다.

### 디자이너: 제품 시스템과 발표 증거

디자이너는 마지막에 화면을 꾸미는 역할이 아니다. 다음 산출물을 순서대로 책임진다.

1. 30분 안에 제품명 후보 3개와 한 문장 톤 제안
2. 90분 안에 색, 타이포, 여백, radius를 포함한 토큰 확정
3. 랜딩 도입부 고정안 7종과 카드뉴스 표지 3종, 캐러셀 5장 레이아웃 확정
4. 개발자가 바로 옮길 수 있는 실제 문구 길이의 Figma 프레임 제공
5. 생성 중, 빈 상태, 오류, 사실 확인 경고 상태 디자인
6. 구현 화면을 2회 QA하고 우선순위별 수정 목록 전달
7. `before/after` 업무 흐름, 제품 데모, 사람이 되찾은 판단을 중심으로 발표 자료 제작
8. 데모용 샘플 캠페인의 시각 자산과 백업 영상 구성

디자인은 전달된 고정 템플릿만 구현한다. 테마 선택기나 자유 편집기는 만들지 않는다.

그 외 팀원이 있다면 실제 사용자 인터뷰, 현재 업무 단계 측정, 발표 스토리, 비즈니스 모델과 현장 규정 확인을 맡긴다. 개발자와 디자이너가 이를 동시에 떠안지 않는다.

### 병합 규칙

- `CampaignSpec`과 mock fixture를 먼저 합의한다.
- 서로의 소유 경로를 동시에 수정하지 않는다.
- 외부 API가 없어도 개발할 수 있도록 양쪽 모두 동일한 fixture를 사용한다.
- 2~3시간마다 짧게 통합하고 마지막에 한꺼번에 합치지 않는다.
- main은 항상 실행 가능하게 유지하고 기능 플래그 뒤에서 미완성 기능을 연결한다.

## 10. 구현 순서와 상대 일정

외부 API를 먼저 연결하지 않는다. 핵심 의존 순서는 다음으로 고정한다.

`CampaignSpec·fixture → 결정적 렌더러 → 외부 API 없는 종단 흐름 → Supabase 공개·예약 → Anthropic adapter → 안정화 → Oracle production`

### 0단계: 30~45분 공동 계약

- 두 개발자가 제품명 임시안, 실제 데모 입력 1개, `CampaignSpec`, 문구 길이와 렌더링 매핑을 합의한다.
- 개발자 B가 Zod 계약과 완성된 fixture의 유일한 작성자가 된다.
- 개발자 A가 저장소와 Next.js scaffold를 초기화하고 첫 실행 가능한 기준점을 만든다.
- 완료 게이트 G0: fixture가 Zod 검증을 통과하고 랜딩·캐러셀에 필요한 값이 모두 존재한다.

### 1단계: 구현 시작 후 2시간

| 개발자 A | 개발자 B |
| --- | --- |
| Next.js 앱, 디자인 토큰, `/new`, `/campaigns/[id]`, `LandingRenderer`, `CarouselRenderer` | `CampaignSpec`, `demoCampaign`, generator·repository 인터페이스, 외부 키가 필요 없는 fixture adapter와 단위 테스트 |

- Supabase와 Anthropic 계정·키 사용 가능 여부만 확인하되 아직 핵심 흐름에 연결하지 않는다.
- 운영 배포 구조를 이 단계에 정하고 fixture 검증 배포 경로를 일찍 확인한다.
- 완료 게이트 G1: 같은 fixture가 실제 공개 랜딩과 캐러셀 PNG 5장을 생성한다.

### 2단계: 이후 4시간, 첫 종단 데모

| 개발자 A | 개발자 B |
| --- | --- |
| 공개 랜딩 예약 폼, 결과 화면과 PNG/ZIP | fixture 기반 게시·slug·예약·명단·다음 판단 adapter와 API 형태 고정 |

- 완료 게이트 G2: 외부 API와 실제 계정 없이 `/ → /new 2단계 입력 → 생성·게시 → /campaigns/[id] → /p/[slug] → 예약 → 결과 → 사람의 판단 → PNG/ZIP`이 끝까지 작동한다.
- 실제 Anthropic 없이도 완성된 흐름을 fixture production build로 실행하고 디자이너 1차 QA를 받는다.
- G2가 끝나기 전에는 Meta OAuth나 광고 객체 생성을 시작하지 않는다.

### 3단계: Supabase 공개·예약 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 내부 API 연결, 게시·중복·실패 상태, 실제 slug 표시와 결과 갱신 | migration, server-only repository, 캠페인 게시·조회, 예약자명단·다음 판단 API |

- 완료 게이트 G3: 게시 후 실제 `/p/[slug]`가 발급되고 시크릿 창의 예약 한 건이 `/campaigns/[id]`에 반영되며 새로고침 뒤 다음 행동이 유지된다.

### 4단계: Anthropic adapter 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 생성 중·재시도·검토 경고 UI | Anthropic Messages API Structured Outputs, Zod 재검증, 단일 90초 호출, prompt version과 명시적 fixture 모드 |

- 완료 게이트 G4: 실제 입력 3종이 유효한 `CampaignSpec`을 만들고, 네트워크·스키마 실패 시 입력을 잃지 않은 채 데모 흐름으로 전환된다.
- AI 연결을 위해 렌더러나 화면별 상태 계약을 바꾸지 않는다. 문제가 생기면 adapter 경계를 먼저 수정한다.

### 5단계: 기능 동결과 검증

- 입력·로딩·오류·중복 예약·긴 문구·모바일 상태를 완성한다.
- 자동 검증 전체와 375px 모바일, 발표 노트북, 시크릿 창 smoke test를 수행한다.
- 데모 데이터, 공개 URL, QR, 백업 영상과 `before/after` 실제 단계 수를 준비한다.

### 발표 6시간 전

- 기능을 동결하고 P1을 전부 중단한다.
- 실제 입력 3종 회귀 테스트와 Anthropic·DB 각각의 실패 리허설을 수행한다.
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
- Playwright로 fixture 기반 `/ → 2단계 입력 → 생성·게시 → 예약 → 판단 → ZIP` 핵심 흐름과 API 실패 상태를 검증한다. 발표 자동 클릭 기능은 만들지 않는다.

수동 검증:

- 375px 모바일과 발표 노트북 해상도
- 한글 줄바꿈, 5장 PNG 1080×1350과 캐러셀 ZIP 파일명·내부 항목
- 시크릿 창에서 공개 URL, 동의 기반 사전예약, 예약자명단과 판단 화면
- 새로고침 후 초안 복구
- API 키가 브라우저, 로그, 저장소에 나타나지 않음
- Anthropic·DB를 각각 끈 상태에서 실패 안내를 확인하고, 개발·발표는 사전에 fixture 모드로 선택
- 랜딩과 카드의 고객·문제·CTA 일치
- Meta의 PNG·문구·CTA·대상 고객·절대 destination URL이 동일 spec과 공개 URL에서 파생됨
- 랜딩과 캐러셀에 근거 없는 후기·수치·인증이 없음

## 12. 3분 데모 시나리오

1. 20초: 아이디어는 있지만 캠페인 제작 때문에 검증을 미루는 예비창업가 또는 초기 1인 사업자를 보여준다.
2. 20초: 기존 도구와 수작업 단계를 한 화면에 보여준다.
3. 30초: 배경과 솔루션을 2단계로 입력하고 캠페인 생성을 시작한다.
4. 45초: 진행 화면 뒤 실제 공개 URL과 캐러셀 ZIP이 한 번에 만들어지는 것을 보여준다.
5. 35초: 공개 랜딩을 다른 창 또는 휴대폰으로 열어 동의 후 사전예약을 제출한다.
6. 20초: 결과 화면에서 예약자명단 증가를 확인한 뒤, 사람이 `계속 검증`을 선택하고 PNG ZIP을 내려받는다.
7. 10초: “콘텐츠를 만든 것이 아니라, 고객을 만나기 전까지의 제작 업무를 없앴다”로 닫는다.

발표에서 시장 검증 완료, 매출 증가, 전환 개선을 주장하지 않는다. 실제로 보여준 공개·동의 기반 사전예약·다운로드와 구현 후 측정한 수동 단계만 말한다.

## 13. 공식 기술 근거

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js layouts and dynamic segments](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic Claude 모델 목록](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Supabase Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase JSON data](https://supabase.com/docs/guides/database/json)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Docker Compose production](https://docs.docker.com/compose/how-tos/production/)
- [OCI security rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)
- [Next.js ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response)
