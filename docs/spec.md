# marketvalley 해커톤 MVP 스펙

상태: 기능 구현 기준 v0.8, Claude 문구 생성 제품 경로와 fixture fallback 구현 완료
마지막 갱신: 2026-08-25
목표: 별도 랜딩 저장소의 시각 요소와 디자인 담당자의 메인 웹사이트 디자인을 반영해 2026 UNITHON 발표용 종단 흐름을 구현한다. 구조와 기능은 이 스펙을 따른다.

현재 저장소에는 Figma 디자인을 반영한 화면, Anthropic 문구 생성 adapter, 검증된 fixture, 결정적 렌더러와 테스트가 있다. Claude는 제품 기본 생성 경로이며 fixture는 자동 테스트와 비상 발표 fallback으로만 명시한다. Supabase API와 실제 Meta 계정은 아직 연결하지 않았으며 live 연동의 완료 기준은 이 문서를 따른다.

## 1. 우승 전략

심사에서 보여줄 것은 생성 기능의 개수가 아니다. 아이디어가 실제 관심 신호로 이어지기 전 존재하던 기획, 재작성, 조판, 배포, 취합 업무가 하나의 흐름에서 사라졌다는 점이다.

발표의 제품 문장은 다음으로 고정한다.

> 아이디어 하나만 남기세요. 첫 시장 반응을 얻기 전까지의 제작 업무는 marketvalley가 지웁니다.

제품은 `배경·솔루션 입력 → 광고 자동 구성·게시 → 공개·내보내기 → 관심 응답 회수 → 사람의 다음 판단`이라는 한 경로만 깊게 완성한다. 자유도, 채널 수, 템플릿 수보다 메시지 일관성, 실제 URL, 실제 응답 한 건, 시각적 완성도와 실패 복구를 우선한다.

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
- 필수값 검증과 오류 문구가 있다.
- 제공된 데모 입력을 한 번에 채우는 `예시 불러오기`가 있다.
- 예시 입력의 상품명과 핵심 특징 3개가 생성된 `CampaignSpec`, 랜딩, 캐러셀과 게시 준비 파일에 같은 값으로 나타난다.
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
- 개인정보가 필요 없는 선택형 질문 1개와 선택지 3개가 나온다.
- 이 가설을 약화시키는 관찰 결과가 `invalidationEvidence` 한 문장으로 나온다.
- 판단 기준은 모델이 임의로 만들지 않고 시스템 기본값 `응답 5개 중 긍정 3개`를 사용하며 리포트에서 실제 응답과 함께 표시한다.
- `schemaVersion`, 생성 모델·시각, Figma 색상, 판단 기준, 캠페인 ID·slug·공개 URL과 실제 응답은 서버가 기록하거나 모델 결과 위에 덮어쓴다.
- 확인되지 않은 숫자, 고객 후기, 인증, 효능을 만들어내지 않는다.
- 사실 검토가 필요한 표현은 `claimsToReview`에 별도로 표시한다.
- 빈 구조화 응답을 포함한 전송·timeout·스키마 오류는 자동 재호출 없이 실패를 명시한 뒤 사용자가 재시도하거나 데모 샘플로 전환할 수 있다.

### P0-3. 광고 생성과 게시

Figma 발표 흐름은 별도 가설 승인 화면을 두지 않는다. `/new`의 두 번째 입력을 제출하면 서버가 `CampaignSpec`을 생성·검증하고 곧바로 광고를 게시한다. 이후 진행 화면을 거쳐 `/campaigns/[id]` 결과 화면으로 이동한다.

랜딩, 캐러셀과 Meta용 사전 확인 화면은 만들지 않는다. 실제 랜딩은 발급된 공개 URL에서 확인하고, 캐러셀은 내려받은 PNG·ZIP이 최종 결과물이다. 내용을 바꾸려면 `/new`로 돌아가 새 광고를 생성한다.

완료 기준:

- 두 번째 입력 제출 전에는 공개 snapshot이나 다운로드 파일을 만들지 않는다.
- 생성·게시 요청은 중복 실행되지 않으며 실패를 성공으로 표시하지 않고 입력을 보존한다.
- `/campaigns/[id]`는 실제 공개 URL, PNG·ZIP 다운로드, 게시 문구 복사, 응답 분포, 사전 기준과 사람의 다음 행동만 제공한다.
- 결과 화면은 현재 응답이 사전 기준에 충분한지 사실만 보여주고, `계속 검증`, `메시지 수정`, `보류` 선택은 사용자가 한다.
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

CTA를 누르면 이름·이메일과 개인정보 동의 체크박스를 받는 예약자명단 폼을 보여준다. 제출된 답은 `campaign_reservation`으로 기록한다. 이 절은 ADR-0013로 갱신됐다 — 이전에는 긍정·중립·부정 익명 응답을 받고 개인정보를 받지 않았으나, 지금은 이름·이메일을 받는 예약자명단 모델을 채택한다.

완료 기준:

- 공개 URL을 시크릿 브라우저와 모바일 뷰포트에서 열 수 있다.
- 같은 브라우저는 같은 캠페인에 한 번만 응답할 수 있고 완료 피드백을 받는다.
- 실제 응답과 세 선택지의 분포가 `/campaigns/[id]` 결과 화면에 반영된다.
- 랜딩 HTML에 `undefined`, 잘린 핵심 문구, 빈 필수 섹션이 없다.

### P0-5. 인스타그램 캐러셀, 게시 문구와 광고 등록 패키지

캐러셀은 1080×1350 비율의 5장으로 고정한다.

1. Hook
2. Problem
3. Insight
4. Solution
5. CTA

첫 번째 Hook 장은 `CampaignSpec.templates.carouselCover`에 따라 Figma 표지 `cover-31`, `cover-32`, `cover-34` 중 하나를 사용한다. 나머지 네 장은 같은 5장 메시지 흐름 안에서 선택된 표지의 사진·흑백·보라 강조·타이포 규칙을 이어 결정적으로 조판한다.

AI는 문구와 선택적 배경 이미지 프롬프트만 만든다. 모든 텍스트는 디자이너가 정의한 React/CSS 템플릿으로 조판한다.

`광고 등록 패키지`는 별도의 광고 카피를 다시 생성하지 않는다. `CampaignSpec`과 게시된 랜딩 URL에서 캐러셀 파일, 기본 문구, headline, CTA, 대상 고객 가설과 destination URL을 조합한다. `/campaigns/[id]`에서 PNG 5장과 `meta-ready.txt`를 하나의 ZIP으로 받거나 각 문구를 복사할 수 있게 하며 별도의 Meta용 시각 화면은 만들지 않는다. 사용자용 이름은 `Meta 게시 준비`이고 실제 광고가 등록됐다고 표현하지 않는다.

완료 기준:

- 내려받은 PNG의 줄바꿈·글꼴·여백이 정해진 템플릿과 일치한다.
- 모든 장을 개별 PNG 또는 하나의 ZIP으로 받을 수 있다.
- 파일명은 `01-hook.png`부터 `05-cta.png`까지 정렬된다.
- 캡션, 후킹 문구 3개, CTA, 해시태그를 복사할 수 있다.
- `Meta 게시 준비` ZIP과 복사 영역에서 사용할 미디어, 기본 문구, headline, CTA, 대상 고객 가설과 절대 랜딩 URL을 한 번에 받을 수 있다.
- 예산, 통화, 기간, 세부 타기팅과 활성화는 AI가 임의로 확정하지 않으며 P0에서 Meta 계정이나 결제수단에 접근하지 않는다.
- 이미지 생성 API 없이도 완성된 기본 시각 결과가 나온다.

### P0-6. 결정적 데모 모드

`lib/demo/demo-campaign.ts`에 완성된 샘플 `CampaignSpec` 3종을 둔다. 기존 camelCase import를 위한 `demoCampaign.ts`는 하위 호환 shim일 뿐 새 코드의 기준 파일로 사용하지 않는다. 데모 모드는 프로덕션 결과와 같은 API 경계와 렌더러를 사용해야 하며 별도의 가짜 UI를 만들지 않는다.

완료 기준:

- 서버 시작 직후 `/campaigns/demo`과 `/p/demo`으로 seed 캠페인에 접근할 수 있고, `/new` 입력은 reference fixture 3종 중 하나의 시각 템플릿을 선택한 뒤 중립 문장 골격에 입력한 상품명·특징·문제·솔루션을 주입한다.
- Anthropic, 이미지 생성, Supabase 중 하나가 실패해도 샘플 흐름으로 랜딩·캐러셀·응답·사람의 판단·다운로드 시연을 끝낼 수 있다.
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

- P0: OAuth, 계정 연결, 광고 객체 쓰기와 실제 집행 없이 `Meta 게시 준비` 파일·복사 기능만 제공한다.
- 해커톤 P1: P0와 발표 준비가 모두 끝났고 팀 소유 테스트 계정과 필요한 권한이 준비된 경우에만 `PAUSED` 생성까지 실험한다. UI와 서버 모두 `ACTIVE` 전환을 막는다.
- 실제 제품: 사용자가 OAuth로 계정을 연결하고 광고 계정·페이지·Instagram identity를 선택한 뒤, 서버가 `PAUSED` 초안을 만들고 계정·통화·시간대·소재·랜딩·타기팅·총예산·종료 시각을 한 화면에서 승인받은 경우에만 활성화할 수 있다. 결제수단 등록과 본인 확인은 Meta UI에서 사용자가 수행한다.

상세 결정과 보안 불변조건은 `docs/decisions/0003-stage-meta-automation-behind-human-approval.md`를 따른다.

다음 기능은 시작하지 않는다.

- Meta 광고 자동 활성화, 결제수단 등록, 무인 예산 증액·재시작
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
- 발표 fixture 광고로 이동하는 카드
- 발표 범위 밖 목 프로젝트는 비활성 카드로 명확히 구분
- `/new`로 이동하는 `새 광고` CTA
- 제품이 없애는 기존 작업을 짧은 `before/after`로 표시

### `/new`

- 제품 배경과 솔루션을 각각 받는 2단계 입력
- 각 단계 20자 이상 검증과 `예시 불러오기`
- `이전`, `다음`, `광고 만들기` 제공
- 처리 중 중복 실행 차단, 실패 안내와 입력 보존

### `/campaigns/[id]/progress`

- `접수`, `준비 중`, `수집 중`, `결과 도착` 4단계 표시
- 게시된 campaign id를 유지해 해당 리포트로 이동

### `/campaigns/[id]`

- 광고 게시 상태와 실제 공개 URL
- 캐러셀 PNG·ZIP과 `Meta 게시 준비` ZIP 다운로드
- 캡션, 후킹 문구, CTA와 해시태그 복사
- 실제 응답 수·분포, 사전 기준과 표본 부족 상태
- `계속 검증`, `메시지 수정`, `보류` 중 사람의 다음 행동 저장
- 랜딩·캐러셀·Meta용 시각 결과를 화면 안에 다시 그리지 않음

### `/p/[slug]`

- 모바일 우선 랜딩페이지
- 동일 CTA를 Hero와 마지막 섹션에 배치
- CTA 뒤 선택형 질문과 응답 성공·중복 상태 표시
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

`Meta 게시 준비`도 별도 문구 상태를 만들지 않는다. 기본 문구는 `messaging.caption`, headline은 `messaging.hooks[0]`, CTA는 `validation.signal.ctaLabel`, 대상 고객 가설은 `validation.customer`, destination은 게시 결과에서 만든 절대 공개 URL을 사용한다. ZIP에는 이 정보를 담은 `meta-ready.txt`와 캐러셀 PNG 5장을 함께 넣는다.

`landing.hero`와 `carousel`은 위 문구를 별도 복제하지 않는다. 게시된 `CampaignSpec`은 snapshot과 내보내기 입력으로 고정하며, 내용을 바꾸려면 새 캠페인을 생성한다.

고정 renderer와 AI 생성 슬롯의 상세 소유 경계, 후킹 3종의 역할과 프롬프트 조합 방식은 [ADR-0011](decisions/0011-separate-fixed-figma-copy-and-ai-slots.md)을 따른다.

## 6. 기술 구조

### 선택 스택

- Next.js App Router, TypeScript, React/CSS 결정적 렌더러
- Zod
- Anthropic TypeScript SDK와 Messages API Structured Outputs
- 제품 생성 기본값은 `anthropic`. 자동 테스트와 비상 발표 fallback만 외부 호출이 없는 `fixture`를 명시하며, 기본 `claude-haiku-4-5-20251001`은 `ANTHROPIC_TEXT_MODEL`로 교체 가능
- 개발·발표에서는 이미지 모델도 비활성화하고 검증된 reference 자산과 결정적 renderer만 사용
- Supabase Postgres
- `html-to-image`와 JSZip
- Vercel 배포
- Vitest 단위 테스트와 Playwright production E2E
- 패키지 관리자는 `pnpm`

별도 백엔드 서버, 메시지 큐, 워커, 컨테이너, 벡터 데이터베이스는 사용하지 않는다.

### 배포 모델

Vercel에는 marketvalley Next.js 애플리케이션 하나를 배포한다. 사용자가 캠페인을 공개할 때마다 별도 서버나 Vercel 프로젝트를 만들거나 다시 배포하지 않는다. `POST /api/campaigns`가 Supabase의 캠페인 row와 slug를 생성하면 이미 배포된 동적 경로 `/p/[slug]`가 그 snapshot을 읽어 즉시 공개한다.

따라서 제품 용어를 다음처럼 구분한다.

- `앱 배포`: 개발자가 코드 변경을 Vercel에 반영하는 행위
- `캠페인 게시`: 사용자가 현재 `CampaignSpec` snapshot을 저장하고 공개 URL을 발급받는 행위

캠페인 게시 성공을 앱 배포 성공으로 표현하지 않는다. 공개 페이지는 승인 당시 snapshot을 사용하며 게시 뒤에는 내용을 바꾸지 않는다. 메시지를 수정하려면 기존 입력을 불러와 새 캠페인을 생성한다.

### 계획된 디렉터리 경계

```text
app/
  page.tsx
  auth/google/route.ts
  auth/callback/route.ts
  auth/logout/route.ts
  campaigns/[id]/page.tsx
  p/[slug]/page.tsx
  api/generate/route.ts
  api/campaigns/route.ts
  api/signals/route.ts
  api/auth/session/route.ts
components/
  auth-controls.tsx
  campaign-wizard.tsx
  campaign-report.tsx
  progress-view.tsx
  renderers/public-landing.tsx
  renderers/carousel-card.tsx
lib/
  auth/authorization.ts
  auth/handlers.ts
  supabase/server.ts
  client/use-auth-session.ts
  contracts/campaign.ts
  contracts/generator.ts
  contracts/repository.ts
  demo/demo-campaign.ts
  demo/fixtureGenerator.ts
  demo/fixtureRepository.ts
tests/unit/
tests/e2e/
```

`lib/ai/`의 prompt 계약과 Google OAuth용 `lib/auth/`, `lib/supabase/` 서버 client는 구현했다. `lib/db/`와 `supabase/migrations/`는 live 데이터 adapter를 구현할 때 추가한다. 현재 존재하지 않는 경로를 구현 완료로 간주하지 않는다.

`lib/contracts/campaign.ts`는 두 개발자가 함께 합의한 뒤 한 명만 소유한다. 랜딩과 캐러셀 렌더러는 API를 직접 호출하지 않는다.

### API 경계

- `POST /api/generate`: 2단계 입력을 검증하고 `{ spec: CampaignSpec }`을 반환한다. Anthropic 모드는 JSON·same-origin·Google 로그인과 생성 quota 제한을 통과해야 한다. fixture fallback은 자동 테스트와 발표 복구를 위해 인증 없이 유지한다. 성공 시 클라이언트가 `crypto.randomUUID()`로 `draftId`를 만들고 바로 게시 요청을 보낸다.
- `POST /api/campaigns`: `{ draftId, spec }`을 다시 검증해 공개 snapshot으로 저장한다. 같은 `draftId`와 동일한 spec의 재요청은 중복 캠페인을 만들지 않고 기존 결과를 반환한다. 이미 게시된 `draftId`에 다른 spec이 오면 충돌로 처리한다. 성공하면 게시 campaign, 공개 URL과 초기 예약자명단을 반환한다.
- `POST /api/reservations`: `{ campaignId, name, email, consent, utm? }`를 검증해 동의된 예약 한 건을 기록한다. fixture는 `(campaignId, email)` hash, live는 서버 HMAC email hash와 DB unique constraint로 중복을 막는다.
- `PATCH /api/campaigns`: `{ campaignId, draftId, nextAction }`을 받아 소유 draft가 맞을 때만 사람의 선택 `continue`, `revise`, `pause`를 저장한다.
- `GET /api/campaigns?id=...`: fixture 또는 로그인한 소유자에게 spec과 예약자 수·최근 예약자명단을 반환한다.
- `POST /api/campaigns/reset`: `{ campaignId, draftId }` 소유권을 검증한 뒤 발표용 추가 예약과 다음 판단을 seed 상태로 되돌린다.
- `DELETE /api/campaigns`: `{ campaignId, draftId }` 소유권을 검증해 캠페인을 삭제한다. 본문 없는 요청은 기존 `/campaigns/demo` 발표 초기화와 E2E 호환에만 사용한다.

모든 route handler에서 입력 크기와 Zod 스키마를 검사한다. `POST /api/reservations`는 동의가 없는 제출을 거절하고 같은 캠페인의 같은 이메일 중복을 `alreadyReserved` 결과로 변환한다. 원문 이메일은 소유자 조회에만 사용하고 목록 화면에는 마스킹한다. Anthropic 키와 Supabase 서버 키는 클라이언트 번들에 포함하지 않는다.

### 데이터베이스

```text
campaigns
- id uuid primary key
- owner_id uuid not null references auth.users(id)
- draft_id text not null
- slug text unique not null
- spec jsonb not null
- next_action text null check in ('continue', 'revise', 'pause')
- published_at timestamptz not null
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
```

(ADR-0013으로 익명 신호를 이름·이메일 기반 `campaign_reservations`로 대체했다. ADR-0016으로
소유자 작업에는 `auth.uid()` RLS를 적용하고 공개 예약·분산 quota만 server-only client가 처리한다.)

현재 mock 입력은 `/new` 컴포넌트 상태에 남아 API 실패 뒤 재시도할 수 있다. 같은 입력의 재시도는 한 번 만든 draft ID와 검증된 spec을 재사용하며, 게시 성공 뒤 draft 소유 토큰을 `localStorage`에 보관한다. live 단계의 새로고침 전 입력 복구는 별도 초안 저장소를 연결한다. 게시 시점의 spec만 snapshot이 되며 게시된 snapshot은 수정하지 않는다.

공개 페이지는 예약자명단 제출 시 이메일을 서버로 보낸다(ADR-0013). 중복 예약 방지는 `(campaignId, email)` 조합으로 판단하며, fixture는 원문을 남기지 않기 위해 무비밀 SHA-256을 사용한다. live Supabase adapter는 서버 전용 `SIGNAL_HASH_SECRET`으로 이메일 HMAC 해시(`email_hash`)를 만들어 dedupe에 쓰고, 원문 `email`은 소유자 화면·리스트 원본 조회용으로 별도 저장한다. 리스트 표시에는 마스킹된 이메일(`seon****@gmail.com` 형태)만 노출하고 공개 예약 응답에는 예약자 수나 목록을 반환하지 않는다. DB 접근은 서버에서만 수행하며 IP 주소와 원문 user-agent를 저장하지 않는다.

### 지표 정의 (ADR-0013로 갱신)

리포트는 현재 저장소에 접수된 예약 데이터와 사전 판단 기준만 수치로 표시한다. 디자인 시안의 임의 우상향 그래프나 고정 노출 수·CTR·업계 평균은 사용하지 않는다.

**실제 지표**

- 예약자 수: `campaign_reservations`에 실제로 기록된 행 수.
- 예약자 리스트: 이름과 마스킹된 이메일. 응답이 0이면 `아직 예약 없음`을 표시한다.
- 예약 접수 추이: 저장된 각 예약의 `reservedAt`을 시간순으로 정렬한 누적 건수. fixture seed와 공개 랜딩 제출을 같은 저장소 결과로 그리되 seed 포함 사실을 화면에 알린다.
- 판단 기준 대비 표본: 현재 예약자 수와 `decisionRule.minimumResponses`의 단순 비교. 시장성 자동 판정은 하지 않는다.

**연동 전 지표**

- 방문 수·체류시간·스크롤 깊이·랜딩 예약률은 방문 이벤트 수집을 구현한 뒤에만 표시한다.
- Meta CTR과 성별·연령·지역은 팀 소유 계정의 Meta Insights 연결과 사용 가능 필드 확인 뒤에만 표시한다.
- 연동 전에는 값을 만들지 않고 화면에 `계측 연결 전` 상태만 표시한다.

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
  reset(input: ResetCampaignInput): Promise<PublishedCampaign>;
  delete(input: DeleteCampaignInput): Promise<void>;
}
```

실서비스는 Anthropic·Supabase adapter를, 테스트와 데모 모드는 fixture generator와 서버 프로세스 메모리 repository를 사용한다. 브라우저는 자신이 만든 캠페인의 draft 소유 토큰만 `localStorage`에 보관한다. 데모 모드는 생성뿐 아니라 게시, 공개 페이지 조회, 중복 예약, 예약자명단 조회, 판단과 초기화까지 실제 Route Handler를 통과한다.

## 7. AI 생성 규칙

- 하나의 호출에서 전체 광고의 문구 슬롯과 허용된 선택자를 생성한다.
- 문법 복잡도를 제한한 평면 Structured Outputs 스키마와 최종 `CampaignSpec` Zod 검증을 함께 사용한다.
- 입력에 없는 수치, 후기, 수상, 인증, 효능, 가격을 발명하지 않는다.
- 실제 인터뷰 근거가 없는 베타테스터 후기, 고객 인용문, 사용 인원은 placeholder로도 만들지 않는다.
- 추론한 정보는 `assumptions`, 확인이 필요한 주장은 `claimsToReview`에 넣는다.
- 모델 결과를 HTML로 직접 실행하지 않는다. 모든 출력은 React 렌더러의 텍스트 데이터로만 사용한다.
- 프롬프트는 `promptVersion`을 가지며 결과와 함께 기록한다.
- live 생성은 실측 지연을 반영한 60초 timeout과 SDK·앱 재시도 0회로 제한해 timeout·빈 응답 뒤 중복 생성과 과금을 막는다.
- 이미지 모델은 글자, 로고, UI, 카드 완성본을 생성하지 않는다.
- 판단 기준의 숫자는 AI가 생성하지 않고 시스템 기본값을 넣는다.

Anthropic 공식 문서상 Structured Outputs는 제공한 JSON Schema 준수를 위한 기능이다. 이미지 생성은 이번 범위에서 사용하지 않으므로 정형 JSON과 결정적 렌더러를 핵심 구조로 사용한다.

## 8. 실패 처리

- Anthropic timeout: 자동 재호출 없이 입력을 보존하고 실패를 명시한다. live 성공을 fixture로 위장하지 않는다.
- 스키마 오류: 서버 검증 실패로 처리하고 입력을 보존한 채 실패를 명시
- 이미지 생성 실패: CSS/SVG 기본 배경 유지
- 저장소 실패: 현재 입력을 유지하고 생성·게시·응답·판단·초기화 실패를 각각 명시
- 신호 중복: 최초 응답을 유지하고 이미 참여했다는 상태 표시
- PNG export 실패: 실패 안내 뒤 브라우저 새로고침과 재시도를 제공하고, 발표에서는 사전 검증한 백업 ZIP으로 전환
- 공개 URL 실패: `/p/demo`와 사전 캡처 영상으로 발표 지속
- 긴 문구: UI에서 잘라 숨기지 않고 스키마 오류와 입력 수정·재생성 안내

## 9. 팀 분업

현재 확인된 제작 인력은 개발자 2명과 디자이너 1명이다. 이름은 시작할 때 역할에 매핑한다.

### 개발자 A: 제품 화면과 통합

- 앱 scaffold와 디자인 토큰 적용
- `/new` 2단계 입력, `/campaigns/[id]/progress`와 `/campaigns/[id]` 결과 화면
- 폼 상태와 내부 API 연결
- 재사용 가능한 랜딩·캐러셀 결정적 렌더러
- 공개 랜딩의 표현 컴포넌트, `Meta 게시 준비` ZIP·복사 기능과 결과 UI
- 동일 렌더러 기반 PNG/ZIP export
- 로딩·빈 상태·오류·데모 fallback UI
- 최종 E2E 흐름과 Vercel 앱 배포 책임

소유 경로 예시: `app/page.tsx`, `app/campaigns/`, `components/`, `lib/export/`, `tests/e2e/`, 전역 스타일과 앱 scaffold.

### 개발자 B: 계약, AI, 공개·측정

- `CampaignSpec` Zod 계약과 데모 fixture
- Anthropic 생성 route와 프롬프트
- Supabase migration과 서버 접근
- 게시·조회·익명 신호·집계·다음 판단 API
- `/p/[slug]`의 데이터 로딩과 상태 처리 wrapper
- fixture·Anthropic·Supabase adapter와 단위 테스트
- 향후 Meta OAuth·token·광고 쓰기·Insights를 담당하는 server-only provider

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

`CampaignSpec·fixture → 결정적 렌더러 → 외부 API 없는 종단 흐름 → Supabase 공개·응답 → Anthropic adapter → 안정화 → 선택적 Meta P1`

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
- Vercel 연결은 이 단계에 시작해 코드 배포 경로를 일찍 확인한다.
- 완료 게이트 G1: 같은 fixture가 실제 공개 랜딩과 캐러셀 PNG 5장을 생성한다.

### 2단계: 이후 4시간, 첫 종단 데모

| 개발자 A | 개발자 B |
| --- | --- |
| 공개 랜딩 예약 폼, 결과 화면, `Meta 게시 준비` ZIP·복사 기능, PNG/ZIP | fixture 기반 게시·slug·예약·명단·다음 판단 adapter와 API 형태 고정 |

- 완료 게이트 G2: 외부 API와 실제 계정 없이 `/ → /new 2단계 입력 → 생성·게시 → /campaigns/[id] → /p/[slug] → 예약 → 결과 → 사람의 판단 → PNG/ZIP`이 끝까지 작동한다.
- 실제 Anthropic 없이도 완성된 흐름을 Vercel 검증 배포에 올리고 디자이너 1차 QA를 받는다.
- G2가 끝나기 전에는 Meta OAuth나 광고 객체 생성을 시작하지 않는다.

### 3단계: Supabase 공개·예약 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 내부 API 연결, 게시·중복·실패 상태, 실제 slug 표시와 결과 갱신 | migration, server-only repository, 캠페인 게시·조회, 예약자명단·다음 판단 API |

- 완료 게이트 G3: 게시 후 실제 `/p/[slug]`가 발급되고 시크릿 창의 예약 한 건이 `/campaigns/[id]`에 반영되며 새로고침 뒤 다음 행동이 유지된다.

### 4단계: Anthropic adapter 연결

| 개발자 A | 개발자 B |
| --- | --- |
| 생성 중·재시도·검토 경고 UI | Anthropic Messages API Structured Outputs, Zod 재검증, 단일 60초 호출, prompt version과 명시적 fixture 모드 |

- 완료 게이트 G4: 실제 입력 3종이 유효한 `CampaignSpec`을 만들고, 네트워크·스키마 실패 시 입력을 잃지 않은 채 데모 흐름으로 전환된다.
- AI 연결을 위해 렌더러나 화면별 상태 계약을 바꾸지 않는다. 문제가 생기면 adapter 경계를 먼저 수정한다.

### 5단계: 기능 동결과 검증

- 입력·로딩·오류·중복 응답·긴 문구·모바일 상태를 완성한다.
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
- Playwright로 fixture 기반 `/ → 2단계 입력 → 생성·게시 → signal → 판단·초기화 → ZIP` 핵심 흐름과 API 실패 상태를 검증한다. 발표 자동 클릭 기능은 만들지 않는다.

수동 검증:

- 375px 모바일과 발표 노트북 해상도
- 한글 줄바꿈, 5장 PNG 1080×1350, 캐러셀·Meta ZIP 파일명과 내부 항목
- 시크릿 창에서 공개 URL, 동의 기반 사전예약, 예약자명단과 판단 화면
- 새로고침 후 초안 복구
- API 키가 브라우저, 로그, 저장소에 나타나지 않음
- Anthropic·DB를 각각 끈 상태에서 실패 안내를 확인하고, 개발·발표는 사전에 fixture 모드로 선택
- 랜딩과 카드의 고객·문제·CTA 일치
- `Meta 게시 준비`의 PNG·문구·CTA·대상 고객·절대 destination URL이 동일 spec과 공개 URL에서 파생됨
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
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [`html-to-image`](https://github.com/bubkoo/html-to-image)
