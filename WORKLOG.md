# 작업 기록

## 2026-08-24 — 우승용 제품 및 구현 스펙 수립

- 목적: 1인 사업자의 시장검증 캠페인 제작 업무를 없애는 아이디어를 3일 해커톤에서 구현 가능한 범위로 고정
- 변경: 제품 브리프, P0/P1 범위, 데이터 계약, 기술 구조, 역할 분담, 상대 일정, 검증 게이트와 3분 데모 시나리오 작성. 독립 검토 후 단순 클릭을 개인정보 없는 선택형 응답으로 강화하고 사람의 다음 판단을 P0로 이동. 반증 근거, 다음 행동 저장, 공유 문구 렌더링 매핑을 계약에 추가
- 영향 범위: `docs/brief.md`, `docs/spec.md`, `docs/decisions/`
- 근거: 공식 행사 공지, 경쟁 제품 공식 페이지, Next.js·OpenAI·Supabase 공식 문서를 확인
- 결정: 단순 멀티채널 소재 생성이 아니라 가설부터 관심 신호까지 검증 루프를 닫고, 단일 `CampaignSpec`과 결정적 React 렌더러 사용
- 검증: 경쟁 차별성 및 2일 구현 가능성 독립 검토 완료. 선택형 신호의 server-side 파생·검증을 포함해 문서 구조와 계약 상호 일관성 확인 완료
- 전달: 로컬 문서만 작성. Git 저장소, 커밋, 원격, 배포는 아직 없음
- 남은 일: 현장 심사·제출 규정 확인, 제품명과 데모 입력 확정, 저장소 초기화 후 P0 vertical slice 구현

## 2026-08-24 — 다음 세션용 구현 인계 기준 정합화

- 목적: 기획 메모와 후속 검토에서 확정한 웹 배포 방식, 두 개발자의 역할, 개발 순서와 Meta 자동화 한계를 다음 세션이 바로 실행할 수 있는 기준으로 기록
- 변경: 스펙을 v0.3으로 갱신하고 `Meta 게시 준비` P0, 단일 Vercel 앱과 campaign slug 게시의 구분, fixture-first G0~G4 구현 순서, 최신 A/B 파일 소유권, 지표 정의와 허위 후기 금지를 반영. Meta P0·P1·실제품 경계와 보안 불변조건을 ADR-0003으로 추가하고 `AGENTS.md` 현재 상태와 세션 시작 절차 갱신
- 영향 범위: `AGENTS.md`, `docs/brief.md`, `docs/spec.md`, `docs/decisions/0002-single-spec-deterministic-renderers.md`, `docs/decisions/0003-stage-meta-automation-behind-human-approval.md`, `WORKLOG.md`
- 결정: 개발자 A는 UI·결정적 renderer·PNG/ZIP·E2E·Vercel, 개발자 B는 계약·fixture·AI·DB·API·공개 route data wrapper를 소유. P0는 Meta 미리보기만, 선택적 P1은 팀 테스트 계정의 `PAUSED` 생성까지만 허용
- 검증: 오래된 v0.2·역할 문구 검색, 필수 인계 파일 존재와 로컬 Markdown 문서 참조 확인, 핵심 용어 교차 검색 수행. 독립 읽기 전용 재검토에서 역할·배포·개발 순서·Meta 경계·지표·개인정보 규칙 사이의 모순이나 깨진 참조 없음 확인
- 테스트: 문서 변경만 있어 애플리케이션 lint·test·build는 실행하지 않음
- 전달: 로컬 문서 갱신 완료. 이 디렉터리는 Git 저장소가 아니므로 commit, push, CI와 배포는 수행하지 않음
- 남은 일: 개발자 A/B 이름과 데모 입력 확정, Git 저장소 초기화, G0 `CampaignSpec`·fixture 동결 후 G1·G2 구현. 심사·제출 규정과 OpenAI·Supabase 사용 가능 여부 확인

## 2026-08-24 — 임시 화면 제거와 디자인 기준 재정렬

- 목적: 기존 랜딩페이지 템플릿과 디자인 담당자의 메인 웹사이트 결과물을 시각 기준으로 사용하기 위해 별도로 만든 임시 화면을 폐기하고 문서·개발환경만 전달
- 변경: `app/`, `components/`, `lib/`, 화면·mock 단위 테스트와 Playwright 설정을 제거. 구현 전 상태에 맞게 README, 협업 가이드, 아키텍처, 기능 흐름, 목데이터·검증·발표 문서를 수정하고 ADR-0005로 UI 구현 시작 조건을 기록
- 영향 범위: 제품 코드 전체, 패키지·테스트·CI 설정, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/`, `.github/`
- 결정: 이전 임시 화면은 참고용으로도 보존하지 않는다. 메인 웹사이트는 디자인 담당자의 확정본 이후에만 구현하고 기존 랜딩페이지 템플릿은 해당 GitHub 저장소에서 별도로 작업한다. 발표 자동 클릭 기능은 만들지 않는다.
- 검증: `pnpm install --frozen-lockfile`, `pnpm check`의 lint·typecheck·빈 Vitest 환경, `pnpm audit --audit-level high`, `pnpm peers check` 통과. Markdown 로컬 링크와 제품 코드 경로 제거를 확인했고 독립 읽기 전용 검토에서 범위 이탈 없음 확인
- 전달: 사용자 Git 신원으로 `e791929`를 생성해 현재 비공개 `unithon26/marketvalley`의 `main`에 반영했고 GitHub Actions 품질 job 통과 확인. Node.js 20 폐기 안내를 제거하기 위해 공식 actions를 Node.js 24 기반 최신 major로 갱신
- 남은 일: 기존 `unithon26/landing-page-reference` 저장소의 후속 구현. 메인 웹사이트는 디자인 담당자의 확정본 대기

## 2026-08-24 — 제품명 `marketvalley` 확정

- 목적: 작업용 이름을 확정 제품명 `marketvalley`로 교체해 코드, 문서와 GitHub 식별자를 일치시킴
- 변경: 패키지명, README, 제품 브리프, 기능 스펙, 사업·시장·발표 문서, ADR, 현재 상태와 저장소 URL의 기존 제품명 표기를 전부 변경
- 영향 범위: 프로젝트 설정, 공개·협업 문서, 작업 기록과 GitHub 저장소 metadata
- 결정: 브랜드 표기는 사용자가 확정한 소문자 `marketvalley`로 통일
- 검증: 기존 제품명 잔여 문자열과 파일명 0건 확인. `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm audit --audit-level high`, `pnpm peers check` 통과
- 전달: 비공개 GitHub 저장소를 현재 `unithon26/marketvalley`로 변경하고 로컬 `origin`을 새 URL에 연결. 제품명 변경 커밋과 GitHub Actions CI 통과
- 남은 일: 이 이름 변경 작업의 남은 일 없음. 메인 웹사이트 화면은 디자인 확정본을 받은 뒤 시작

## 2026-08-24 — Figma 기반 발표용 mock 종단 데모 구현

- 목적: 전달된 Figma 전체 흐름을 제품 계약에 맞게 반영하고 외부 API·계정 없이 3분 발표를 끝낼 수 있는 종단 데모 완성
- 변경: Figma의 홈, 2단계 입력, 진행 상태, 리포트와 스타일 가이드를 반영. `CampaignSpec` Zod 계약과 `마감한입` fixture, 가설 승인, 결정적 공개 랜딩·캐러셀 렌더러, 익명 선택형 응답, 사전 기준 집계, 사람의 다음 판단, PNG 5장 ZIP과 `Meta 게시 준비` 파일 구현. Playwright 핵심 시나리오와 단위 테스트 추가
- 영향 범위: `app/`, `components/`, `lib/`, `tests/`, Playwright·패키지·CI 설정, `README.md`, 제품·아키텍처·발표·검증 문서와 ADR-0007
- 결정: 발표 중 외부 실패를 제거하기 위해 생성·저장을 결정적 fixture와 브라우저 `localStorage`로 구현. Figma의 예약·이메일 수집은 개인정보 없는 관심 신호와 사람의 판단으로 치환. 실제 OpenAI·Supabase·Meta·배포는 수행하지 않음
- 검증: `pnpm check`, `pnpm build`, `pnpm test:e2e` 통과. Chromium에서 데스크톱 전체 흐름, ZIP 다운로드, 375px 공개 랜딩·결과 화면, 중복 응답 방지와 판단 새로고침 유지를 확인
- 전달: 사용자 Git 신원으로 기능 커밋 `892c1d6`과 Next.js 생성 파일 정리 커밋 `aafb6d6`을 생성해 비공개 `unithon26/marketvalley`의 `main`에 push. 최종 GitHub Actions run `32726700744`에서 install, lint, typecheck, 단위 테스트, production build, Chromium 설치와 E2E 모두 통과
- 남은 일: 발표 노트북에서 실제 3분 리허설, 운영진의 제출·심사 규정 확인. 실제 배포·OpenAI·Supabase 연동은 별도 승인과 후속 작업 필요

## 2026-08-24 — 개발자 B fixture 백엔드와 mock API 구현

- 목적: 개발자 A의 화면 흐름이 외부 키 없이 실제 내부 API를 통과하도록 Task 2~7을 완성하고, 다음 Task 13 통합 E2E의 안정된 계약을 제공
- 변경: `demo-campaign.ts`를 canonical fixture로 합치고 camelCase 파일은 하위 호환 shim으로 축소. 마감할인·동네공방 빈자리·클래스 문의형 reference template과 키워드 기반 `FixtureCampaignGenerator`, 서버 메모리 `FixtureCampaignRepository`, 요청·응답 Zod 계약과 `/api/generate`, GET·POST·PATCH·DELETE `/api/campaigns`, `/api/signals` 구현. 게시 멱등성, 다른 spec 충돌, 방문자 중복, 초안 소유권, 판단 저장, 삭제·초기화와 HMR singleton 버전을 처리
- 영향 범위: `lib/contracts/`, `lib/demo/`, `app/api/`만 변경. 개발자 A 소유 화면과 테스트 파일은 수정하지 않음
- 결정: 발표 binding은 A Task 10~12와 맞춰 항상 `id/slug=demo`를 재사용하고 본문 없는 DELETE로 seed 응답과 판단을 초기화한다. 일반 `FixtureCampaignRepository`는 옵션 없이 만들면 다중 캠페인을 유지해 내일 adapter 작업과 단위 검증에 사용할 수 있다. 실제 외부 연동은 추가하지 않음
- 검증: 로컬 `pnpm check`에서 lint·typecheck·기존 단위 테스트 9개 통과, `pnpm build` 통과, 기존 Chromium E2E 1개 통과. production HTTP smoke에서 reference template 3종, `{ spec }` 생성 응답, `demo` 게시, 동일 draft 멱등, 다른 spec 409, seed 4건에서 응답 5건 집계, 동일 visitor 409, 판단 저장, 본문 없는 DELETE 초기화, 세 발표 경로 200을 확인. 독립 리뷰에서 fresh 로컬 통합 blocker 없음 확인
- 전달: 사용자 Git·GitHub 신원과 검증된 commit email, staged 경로와 비밀정보를 확인한 뒤 커밋 `359d06b`을 비공개 저장소 `main`에 직접 push. GitHub Actions run `32739718268`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E 전부 통과
- 남은 일: 개발자 A가 `origin/feat/dev-a-flow`에 최신 `main`을 반영해 Task 13 통합 E2E를 작성한다. `PublicLanding`이 `/api/signals`의 404·400·500을 저장 성공으로 표시하지 않도록 non-2xx 처리를 추가한다. 배포형 다중 기기 데모 전 server-memory repository를 Supabase로 교체한다.

## 2026-08-25 — 개발자 A/B mock 종단 흐름 통합과 Task 13 완료

- 목적: 개발자 A의 Task 8~12 화면 흐름과 개발자 B의 Task 2~7 fixture API를 합쳐 외부 키 없이 발표 가능한 종단 경로를 `main`에 전달
- 변경: 2단계 입력을 생성·게시 API에 연결하고 캠페인별 고유 id·slug, draft 소유 토큰과 멱등 재시도, 서버 초기 리포트와 polling 갱신, 공개 응답·판단·초기화의 정직한 오류 상태를 구현. repository 공통 reset 계약과 전용 route를 추가하고 공개 랜딩의 고정 문구를 `CampaignSpec` 기반으로 정리. 3.1초 이상 느린 조회가 겹치거나 최신 판단을 되돌리지 않도록 polling 경쟁을 차단
- 영향 범위: `app/`, `components/`, `lib/client/`, `lib/contracts/`, `lib/demo/`, `tests/`, 환경 예시, 제품·아키텍처·발표·검증 문서와 ADR-0008
- 검증: 로컬 `pnpm check`에서 lint·typecheck·단위 테스트 19개 통과, `pnpm build` 통과, Chromium E2E 7개 통과. production HTTP smoke에서 생성·게시 멱등성, 동적 id·slug 조회, 응답·중복, 판단·초기화·삭제를 확인. 독립 재검토에서 기존 High·Medium finding을 모두 닫고 새 finding 없음 확인
- 결정: 발표용 fixture는 서버 프로세스 메모리와 내부 API를 실제로 사용하되 새 캠페인을 격리한다. 브라우저에는 visitorId와 draft 소유 토큰만 둔다. Supabase·OpenAI·Vercel은 발표 mock을 안정화한 뒤 별도 adapter로 교체한다.
- 전달: 사용자 Git 신원으로 통합 커밋 `1fc3e84`, 개발자 A 최신 이력 merge `7b44a80`, 검증 문서 커밋 `9e593d2`를 비공개 저장소 `main`에 push. PR #1은 `MERGED` 처리됐고 GitHub Actions run `32744683041`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E가 모두 통과
- 남은 일: 발표 노트북에서 `docs/demo-runbook.md` 기준 3분 리허설, 운영진의 심사·제출·AI·외부 자산 규정 확인. 다중 기기 공개 데모는 Supabase, 실제 생성은 OpenAI, 배포는 Vercel 계정·키와 별도 승인이 필요

## 2026-08-25 — 발표용 mock 전체 QA와 전달 마감

- 목적: 친구가 올린 모든 Git 이력과 A/B 통합 상태를 확인하고, 발표용 mock의 기능·산출물·실패 경계·모바일·접근성을 빠짐없이 재검증해 부족한 부분을 보완
- 변경: 홈의 진행/완료 필터, 공개 페이지 SEO와 fixture별 브랜드 테마, 계약 배열·응답 라벨 중복 검증, strict slug 조회, 무응답·사전 기준 gap 표시, 복사 문구 4종, 실제 PNG 5장과 문구·절대 URL·visual direction을 담은 Meta 게시 준비 ZIP을 완성했다. 동적 브랜드 색의 4.5:1 텍스트 대비와 오류 배지를 보장하고 Playwright가 기존 서버를 재사용하지 않은 채 매번 production build를 검증하도록 격리했다.
- 영향 범위: 홈·공개 랜딩·리포트 UI, `CampaignSpec`, fixture repository, 브랜드 테마 helper, Playwright 설정과 단위/E2E 테스트, README와 제품·아키텍처·발표·검증 문서
- 검증: `pnpm check`에서 lint·typecheck·단위 테스트 24개, production build 기반 Chromium E2E 11개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 81.86%, branches 73.23%, functions 92.3%, lines 83.85%다. 데스크톱과 375px에서 전체 흐름·overflow·키보드·ARIA·응답 갱신을 수동 확인했고, 독립 리뷰의 production E2E 격리·색 대비·중복 라벨 지적을 모두 닫았다.
- 결정: 발표 안정성을 위해 실제 OpenAI·Supabase·Meta·Vercel을 추가하지 않고 결정적 fixture와 서버 메모리 mock을 유지한다. Meta 결과는 실제 게시로 오해되지 않는 준비 ZIP으로 제공하며, 모든 동적 색상은 렌더러가 계산한 고대비 foreground를 사용한다.
- 전달: 사용자 Git/GitHub 신원·검증 이메일, 의도한 22개 경로와 staged 비밀정보를 확인한 뒤 커밋 `0497b08`을 비공개 저장소 `main`에 직접 push했다. GitHub Actions run `32789467027`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E가 모두 통과했다.
- 남은 일: 발표 노트북에서 `docs/demo-runbook.md` 기준 실제 3분 리허설과 운영진의 심사·제출·AI·외부 자산 규정 확인. 실제 다중 기기 공개는 Supabase, 실제 생성은 OpenAI, 배포는 Vercel 계정·키와 별도 승인이 필요하다.

## 2026-08-25 — 디자이너 Figma 최신본 반영 감사

- 목적: 디자이너가 공유한 `유니톤` Figma 최신본과 현재 `main` 화면을 직접 대조해 누락된 디자인을 구분
- 확인: 홈, 2단계 온보딩, 접수·준비 중·수집 중·결과 도착 진행 화면, 리포트의 레이아웃과 보라색 토큰·타이포·간격·상태 구조는 현재 구현에 반영돼 있다. 리포트의 광고 노출·CTR·예약 이메일은 개인정보 없는 선택형 신호라는 확정 제품 계약에 따라 의도적으로 사용하지 않는다.
- 미확정: Figma 댓글의 `내일 할 일`에 최종 로고, GNB, 카드 UI 상태 아이콘과 진행 그래픽이 명시돼 있고 저장소에도 SVG·PNG export가 없다. 현재 `brand-mark`, `visual-orb`, `processing-orb`는 발표 흐름을 유지하는 CSS fallback이다.
- 검증: Figma 각 프레임과 실행 중인 `/`, `/new`, `/campaigns/demo/progress`, `/campaigns/demo`를 데스크톱에서 시각 대조했다. `main`과 `origin/main`은 `0497b08`로 일치하고 새 원격 디자인 브랜치·커밋은 없다.
- 전달: 확정 자산이 없어 제품 코드, commit과 push는 변경하지 않았다.
- 남은 일: 디자이너가 최종 SVG/PNG와 GNB 상태를 전달하면 fallback만 교체하고 전체 `pnpm check`, production E2E와 데스크톱·375px 시각 회귀를 수행한다.

## 2026-08-25 — Figma 카드뉴스·랜딩 고정 템플릿 정합화

- 목적: 공유 Figma의 카드뉴스 표지 `31`·`32`·`34`와 랜딩 도입부 고정안 `1`~`7`이 실제 발표 산출물에 반영됐는지 재감사하고 누락된 시각 템플릿 경계를 완성
- 변경: `CampaignSpec`을 v2로 올려 `templates.carouselCover`와 `templates.landingIntro`를 필수화. 표지 3종, 랜딩 도입부 7종의 결정적 React/CSS 렌더러, Figma 사진 자산 preloading, fixture별 템플릿 선택, Meta 준비 파일의 템플릿 ID를 구현. HMR에 남은 v1 singleton 때문에 `/p/demo`가 500이 된 현상을 확인하고 fixture repository global key를 교체해 새 계약으로 재초기화
- 영향 범위: `CampaignSpec`, fixture·mock repository, 공개 랜딩·캐러셀·ZIP renderer, 전역 스타일, 단위·E2E 테스트, README와 스펙·아키텍처·목데이터·검증 문서, ADR-0009
- 검증: `pnpm check`에서 단위 테스트 25개, production build를 포함한 Chromium E2E 12개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check` 통과. 커버리지는 statements 82.02%, branches 73.23%, functions 92.3%, lines 84.02%. 데스크톱과 375px 랜딩, 세 reference fixture, 표지 3종의 실제 1080×1350 PNG를 눈으로 대조. 독립 리뷰가 찾은 최대 길이 표지 잘림·랜딩 템플릿 2 겹침과 표지 31·34 export 회귀 검증 누락을 수정하고 경계값 E2E로 고정
- 결정: 템플릿을 brand tone에서 추론하지 않고 snapshot에 명시한다. Figma에 확인된 것은 전체 랜딩 7종이 아니라 `1. 도입부 템플릿`의 고정안 7종이므로 이후 문제·가치·작동 방식·익명 신호·FAQ는 공통 계약을 유지한다.
- 전달: 사용자 Git/GitHub 신원과 검증된 이메일, 의도한 20개 경로와 staged 비밀정보를 확인한 뒤 커밋 `9cc5444`를 비공개 저장소 `main`에 직접 push했다. GitHub Actions run `32795735167`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E가 모두 통과했다.
- 남은 일: 표지 `32`·`34` 사진의 원출처와 사용권을 디자이너에게 확인하고, 최종 로고·GNB·카드/진행 그래픽 export를 받은 뒤 fallback을 교체한다. 발표 노트북에서 3분 리허설과 운영 규정 확인이 필요하다.

## 2026-08-25 — 입력 상품명·특징 개인화와 Figma 산출물 재정합화

- 목적: `/new`에 적은 상품명과 특징이 고정 fixture에 덮여 사라지고 생성 랜딩·카드뉴스가 Figma 슬롯과 다르게 보이던 문제를 해결
- 변경: reference fixture를 시각 template·색상 선택에만 사용하고 중립 문장 골격에 입력한 상품명, 특징 3개, 문제와 솔루션을 결정적으로 주입했다. `상품명/제품명/서비스명`, `특징/핵심 기능`, 따옴표·조사·줄바꿈 목록과 80자 이름을 처리하고 일반 문장의 `익명`, `이름 없이`, `기능과`를 선언으로 오인하지 않게 했다. 랜딩 도입부 7종의 상품명·한 줄 설명·특징 슬롯과 카드 표지 3종, 후속 2~5장의 같은 사진·흑백·보라 강조 조판, Meta 준비 파일을 같은 spec에 연결했다. 개발자 A 원격 브랜치를 전부 감사해 Figma 대시보드 카드 아이콘 구현만 원저자 이력으로 통합했다.
- 영향 범위: mock generator, 랜딩·캐러셀 renderer와 CSS, 입력·진행·리포트 문구, Meta 준비 파일, 홈 카드 비주얼, 단위·E2E 테스트, README·아키텍처·제품·목데이터·검증 문서와 ADR-0010
- 결정: 이름이 없으면 업종과 무관한 `새 시장검증 캠페인`, 특징이 부족하면 중립 기본 특징을 사용한다. reference 키워드 하나가 겹쳐도 고객·단계·FAQ·해시태그가 다른 업종에서 누출되지 않는다. 친구 브랜치의 선택적 이메일·고정 광고 지표 계획 문서는 구현되지 않았고 개인정보 없는 응답·측정값 진실성 계약과 충돌해 통합하지 않았다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 33개, 새 production build 기반 Chromium E2E 13개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check` 통과. 커버리지는 statements 87.96%, branches 77.55%, functions 94.31%, lines 89.27%. 실제 입력 `공방온`과 특징 3개로 공개 랜딩, 리포트 DOM, 1080×1350 PNG 5장과 Meta ZIP을 확인했고 독립 리뷰가 찾은 parser 오인·업종 누출·길이·슬롯·export 회귀를 모두 닫았다.
- 전달: 입력 개인화 커밋 `79d0e5f`와 개발자 A 카드 비주얼 통합 커밋 `ae1ff04`를 비공개 `unithon26/marketvalley`의 `main`에 push. GitHub Actions run `32800015295`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E가 전부 통과했다.
- 남은 일: 표지 `32`·`34` 사진의 원출처·행사 사용권·인물 사용 동의를 디자이너에게 확인하고 최종 로고·GNB·진행 그래픽 export를 받으면 fallback을 교체한다. 발표 노트북에서 3분 리허설과 운영 규정을 확인한다. 실제 OpenAI·Supabase·Vercel 연결은 별도 승인 후 진행한다.

## 2026-08-25 — 개발자 A/B 충돌 PR 정리와 오늘 QA 재검증

- 목적: 사용자와 개발자 A의 변경이 충돌한다는 보고를 원격 PR과 실제 Git merge 기준으로 확인하고, 오늘 발표 QA를 시작할 수 있는 단일 기준 상태로 정리
- 확인: 열린 PR #2의 head `468e8b1`과 최신 `main` `ae1ff04`를 `git merge-tree`로 대조해 `app/page.tsx`, `components/progress-view.tsx`의 실제 content conflict를 재현했다. PR의 카드 비주얼은 개발자 A의 원저자 정보를 보존한 `ae1ff04`로 이미 `main`에 반영돼 있었다.
- 결정: 최신 입력 개인화·Figma 템플릿·QA 경계를 보존했다. PR의 `약 2분`, `광고 검증`, 전체 `프로젝트` 용어 변경과 범위 밖 이메일·광고 지표 계획은 실제 약 2초 데모, `시장검증 캠페인` 사용자 계약과 측정값 진실성 경계를 후퇴시켜 병합하지 않았다. 충돌 브랜치를 삭제하거나 history를 고치지 않고 PR만 대체 완료로 닫아 복구 가능성을 유지했다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 33개, 새 production build 기반 Chromium E2E 13개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 87.96%, branches 77.55%, functions 94.31%, lines 89.27%다.
- 화면 QA: 사용자가 공유한 `유니톤` Figma 원본을 브라우저에서 다시 열어 홈 `1. 메인페이지`, 온보딩 `2-1/2-2`, 진행 상태 6개 프레임, 리포트 3개 프레임, 랜딩 도입부 그룹과 카드뉴스 표지 `31`·`32`·`34`를 실행 중인 production 앱과 대조했다. 홈·온보딩·진행·리포트의 레이아웃·토큰·단계 구조에 충돌 회귀가 없고 브라우저 console·서버 오류도 없었다. Figma에 모바일 전용 프레임은 없으며 375px은 통과한 E2E를 근거로 유지한다. Wanted GNB, 미완성 진행 그래픽은 최종 export 전 placeholder이고, 광고 노출·CTR·이메일 표는 현재 제품의 실제 선택형 응답·사람 판단 계약과 달라 의도적으로 복사하지 않았다.
- 전달: PR #2 설명을 실제 처리 결과로 갱신하고 충돌 해결 근거를 댓글로 남긴 뒤 `CLOSED` 처리했다. 제품 tree는 검증된 `ae1ff04`와 동일해 새 commit·push는 만들지 않았고, 기존 `main` GitHub Actions run `32800015295`의 성공 상태를 재확인했다. 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 코드 충돌과 오늘 자동 QA의 남은 일 없음. 발표 노트북에서 `docs/demo-runbook.md` 기준 실제 3분 리허설을 진행하고 표지 `32`·`34` 사진의 행사 사용권·인물 동의를 확인한다.

## 2026-08-25 — Figma 고정 영역과 AI 문구 슬롯 계약

- 목적: Figma 디자인에서 고정할 요소와 사용자 입력으로 생성할 문구를 분리하고, 랜딩·카드뉴스의 모든 가변 슬롯과 후킹 문구에 목적별 생성 지시를 준비
- 변경: `lib/ai/campaignPrompts.ts`에 Figma renderer·서버 고정 영역, AI 문구 슬롯 20개 그룹, 후킹 3종의 역할, 금지 주장, 채널 간 메시지 일관성, 사용자 입력의 명령 격리와 `campaign-spec-v1` prompt version을 구현. 스펙·아키텍처·연동 계획·검증 기록과 ADR-0011 갱신
- 결정: 랜딩·캐러셀·Meta를 따로 호출하지 않고 슬롯별 지시를 하나의 developer prompt로 조합해 전체 `CampaignSpec`을 Structured Outputs 한 번으로 생성한다. 색상·레이아웃·안전 안내·판단 기준·실제 응답은 AI가 바꾸지 않는다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 38개, `pnpm build`, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check` 통과. 커버리지는 statements 88.35%, branches 77.55%, functions 94.62%, lines 89.66%. GitHub Actions run `32803119983`에서 production build와 Chromium E2E 13개까지 전부 통과
- 전달: 사용자 Git/GitHub 신원과 검증된 이메일, 의도한 7개 경로와 staged 비밀정보를 확인한 뒤 커밋 `1d1c477`을 비공개 `unithon26/marketvalley`의 `main`에 push
- 남은 일: 실제 OpenAI 호출과 문구 품질 eval은 G3 Supabase 뒤 G4 adapter 단계에서 연결한다. 현재 발표 mock은 결정적 fixture를 유지한다.

## 2026-08-25 — 사용자 노출 용어를 광고로 통일하고 작업 기록을 Git 추적

- 목적: `새 캠페인`, `캠페인 만들기`처럼 사용자에게 부자연스러운 제품 문구를 광고 중심 용어로 바꾸고, 작업·트러블슈팅 기록을 팀이 GitHub에서 함께 볼 수 있게 한다.
- 변경: 홈, GNB, 2단계 입력, 진행, 결과, 공개 랜딩, API 오류와 fixture·향후 생성 프롬프트의 사용자 노출 문구를 `광고`, `광고 초안`으로 통일했다. `CampaignSpec`과 `/campaigns` 내부 계약은 호환성을 위해 유지하되 화면에서는 노출하지 않는다. 발표 실행서·검증 문서·제품 스펙·README도 같은 용어 경계로 갱신했다.
- 기록 정책: `.gitignore`에서 `WORKLOG.md`, 루트 troubleshooting 파일과 `docs/worklog(s)`, `docs/troubleshooting`, `docs/incidents` 제외 규칙을 제거했다. 앞으로 이 기록은 팀 공유 문서로 commit·push하고 `AGENTS.md`와 개인 에이전트 설정만 로컬로 유지한다.
- 검증: 변경된 generator·prompt 단위 테스트 18개, `pnpm check`의 lint·typecheck·단위 테스트 38개, `pnpm build`, production build 기반 Chromium E2E 13개가 통과했다. E2E는 홈·진행·결과 화면에 `캠페인`과 `CampaignSpec`이 노출되지 않는 경계도 확인한다.
- 전달: 사용자 Git 신원으로 커밋 `02dec40`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32803996716`에서 install, lint, typecheck, 단위 테스트, production build와 Chromium E2E 13개가 모두 통과했다.
- 남은 일: 이 작업 범위의 제품 변경은 없다. 제품 배포와 행사 제출은 수행하지 않는다.

## 2026-08-25 — Google OAuth 서버 계약과 세션 경계 구현

- 목적: 로그인 화면 디자인 전에도 Google OAuth 시작, callback, 세션, 로그아웃과 서버 권한 확인을 완성해 이후 UI와 Supabase 광고 소유권을 안전하게 연결할 수 있게 한다.
- 변경: Supabase Auth Authorization Code + PKCE를 사용하는 `/auth/google`, `/auth/callback`, `/api/auth/session`, `/auth/logout`, `/auth/error`와 Next.js 16 Proxy를 구현했다. access·refresh token은 HttpOnly·SameSite=Lax 쿠키에 두고 production Secure, 내부 `next` 제한, 고정된 배포 origin, same-origin POST 로그아웃, 현재 세션만 종료, no-store 응답, 최소 사용자 정보와 `getClaims()` 기반 권한 helper를 추가했다. 동시 로그인은 `sb_flow_id`별 verifier와 10분짜리 이동 경로 쿠키로 분리했다. `useAuthSession` hook과 임시 `AuthControls`를 GNB에 연결해 로그인·사용자·로그아웃·재시도·미설정 상태를 제공하고 디자인 교체 범위를 표현 컴포넌트로 제한했다. 외부 Auth 장애가 fixture 데모를 중단하지 않게 Proxy를 격리했다.
- 영향 범위: `app/auth/`, `app/api/auth/`, `lib/auth/`, `lib/supabase/`, `proxy.ts`, 인증 단위 테스트, 환경 예시, README·아키텍처·스펙·연동·검증 문서와 ADR-0012
- 결정: Google 토큰을 직접 관리하거나 브라우저 client에 노출하지 않고 Supabase SSR BFF를 사용한다. Google Console redirect URI는 Supabase callback이며 marketvalley callback은 Supabase Redirect URLs에 등록한다. 기존 fixture 광고 route의 로그인 강제와 실제 광고 소유권은 G3 RLS 전까지 보류한다.
- 검증: 인증 테스트 28개와 `pnpm check`의 lint·typecheck·단위 테스트 66개, `pnpm build`, production Chromium E2E 14개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 81.86%, branches 75.08%, functions 89.92%, lines 84.97%다. 설정 없는 production HTTP smoke에서 홈 200과 직접 호출한 인증 endpoint의 `auth_not_configured` 503·private no-store를 확인했고 GNB는 불필요한 요청 없이 fallback을 표시했다. 독립 보안 검토에서 찾은 로그아웃 오류, 동시 PKCE verifier, callback allow-list 3건을 수정하고 회귀 테스트로 고정했다.
- 전달: 사용자 Git/GitHub 신원과 계정에 연결된 commit 이메일, 의도한 39개 경로와 staged 비밀정보를 확인한 뒤 기능 커밋 `527888e`를 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32807054839`의 install·lint·typecheck·단위 테스트·production build·Chromium E2E가 모두 통과했다. 실제 Google·Supabase 계정 쓰기, 배포와 행사 제출은 수행하지 않았다.
- 남은 일: [인증 운영 가이드](docs/authentication.md)에 따라 Google Console에 Supabase callback을 등록하고 Supabase provider·Site URL·`sb_flow_id`를 허용하는 Redirect URL 패턴·환경변수를 설정한 뒤 실제 계정으로 로그인·동시 flow·갱신·로그아웃을 검증한다. G3 migration과 RLS에서 `auth.uid()` 광고 소유권을 연결한다. 디자이너 확정본이 오면 `AuthControls` markup과 `auth-*` CSS만 교체한다.

## 2026-08-25 — Google OAuth 실제 계정 연결과 client 환경 경계 수정

- 목적: 준비된 Google OAuth 서버 계약을 local Supabase 프로젝트와 실제 계정에 연결하고, 임시 GNB에서 로그인·로그아웃이 실제로 동작하는지 확인한다.
- 변경: Google Web client의 local origin과 Supabase callback, Supabase Google provider·Site URL·flow ID Redirect URL·publishable key를 연결했다. client component에서 `process.env` 객체 전체가 비어 GNB만 미설정으로 남던 문제를 공개 환경변수의 정적 참조로 수정하고, E2E server는 개인 `.env.local`과 무관한 미설정 환경을 명시하도록 고정했다.
- 영향 범위: Google Auth Platform, Supabase Authentication 설정, 로컬 `.env.local`, `SiteHeader`, Supabase 공개 설정 helper, 단위·E2E 설정, README·인증·아키텍처·연동·검증·troubleshooting 문서
- 검증: 실제 Google 동의와 PKCE callback, GNB 사용자 표시, Supabase Auth 사용자 생성, 현재 세션 POST 로그아웃과 익명 복귀를 확인했다. `pnpm check`의 lint·typecheck·단위 테스트 67개, configured production bundle smoke, production Chromium E2E 14개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 82.24%, branches 75.43%, functions 90.71%, lines 85.38%다. 독립 보안 재검토가 찾은 client bundle 회귀 테스트 공백을 별도 build smoke와 CI gate로 닫았다.
- 결정: Google Client Secret은 Supabase provider에만 저장하고 로컬 파일·Git에는 두지 않는다. `.env.local`은 공개 URL과 publishable key만 가지며 Git에서 제외한다. 실제 로그인 연결과 광고 데이터 소유권은 별개이므로 fixture route에는 아직 로그인을 강제하지 않는다.
- 전달: local Google·Supabase 설정과 종단 검증을 완료하고 기능 커밋 `0f12f61`과 팀원의 예약자명단 설계를 보존한 병합 커밋 `e205985`를 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32809977111`에서 install·lint·typecheck·단위 테스트 67개·configured production bundle smoke·production build·Chromium E2E 14개가 모두 통과했다. production URL·Vercel 설정, 배포와 행사 제출은 수행하지 않았다.
- 남은 일: G3 migration·RLS·repository에 `auth.uid()` 소유권을 연결한다. 배포 시 production Site URL·Redirect URL·Vercel 환경변수를 추가하고 새로고침·토큰 갱신·동시 탭 OAuth를 실제 도메인에서 재검증한다. 디자이너 확정본이 오면 `AuthControls` markup과 `auth-*` CSS만 교체한다.

## 2026-08-25 — OpenAI 로컬 환경변수 준비

- 목적: 향후 OpenAI adapter가 사용할 서버 전용 API 키를 로컬 Next.js 환경에 준비한다.
- 변경: Git에서 제외되는 루트 `.env`에 `OPENAI_API_KEY`를 설정하고 파일 권한을 소유자 전용으로 제한했다. `.env.example`에는 실제 값 대신 교체용 placeholder를 명시했다.
- 검증: 설치된 Next.js 16 환경변수 로더에서 키 존재와 형식을 확인했다. `.env`의 Git 제외 여부, 권한 `600`, Git 추적 파일 전체의 비밀키 패턴 부재와 `.env.example` diff 형식을 확인했다. 실제 OpenAI API 호출은 수행하지 않았다.
- 전달: 로컬 환경 설정만 완료했다. 현재 작업 트리에 다른 진행 중 변경이 있어 commit·push하지 않았다.
- 남은 일: G4 OpenAI adapter 구현 시 서버 전용 `OPENAI_API_KEY`를 사용해 실제 호출과 실패 fallback을 검증하고, 노출된 키는 OpenAI에서 회전한다.

## 2026-08-25 — 개발자 A: 예약자명단 전환(ADR-0013) 병합 알림 — 개발자 B 확인 요청

- 대상: 개발자 B(Codex 세션). 이 항목은 위 Google OAuth 작업과 충돌 없이 병합됐음을 알리고, B의 확인이 필요한 결정을 전달하기 위한 것이다.
- 목적: 익명 3지선다 신호를 이름+이메일 예약자명단으로 바꾸는 방향을, 이 문서 위쪽 "개발자 A/B 충돌 PR 정리" 항목에서 B가 반려했던 바로 그 방향임을 인지한 상태에서 제품 책임자가 레퍼런스(`proo-landing.vercel.app`)를 근거로 의도적으로 재확정했음을 기록하고 공유
- 변경: `docs/decisions/0013-switch-anonymous-signal-to-named-reservation.md`(ADR-0013)를 새로 작성하고, `docs/spec.md`(P0-4, 지표 정의, Supabase 스키마 스케치)와 `docs/validation.md`(안전성과 진실성)를 이 ADR 기준으로 갱신했다. 데이터 계약·화면 변경 범위·작업 순서·A/B 분담은 `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md`에 별도로 기록했다. `WORKLOG_A.md`, `TROUBLESHOOTING_A.md`를 개발자 A 개인 기록으로 신설했다
- 영향 범위: `docs/decisions/0013-*.md`, `docs/spec.md`, `docs/validation.md`, `docs/superpowers/specs/2026-08-25-*.md`, `WORKLOG_A.md`, `TROUBLESHOOTING_A.md`. 제품 코드(`app/`, `components/`, `lib/`)는 이 항목에서 변경하지 않았다
- 결정: `docs/decisions/0001-close-the-validation-loop.md`·`docs/validation.md`의 "이름·이메일·전화번호를 받지 않는다" 원칙은 신호(응답) 계층에 한해 ADR-0013으로 대체됐다. ADR 번호 `0012`는 B의 `0012-use-supabase-pkce-auth-behind-server-routes.md`와 겹쳐서 A 쪽을 `0013`으로 재번호했다 — 다음 ADR은 `0014`부터 사용할 것
- 검증: 문서 전용 변경이라 `pnpm check`는 실행하지 않았다. push 전 `origin/main`을 다시 확인해 B의 `527888e`·`c5a2f90`과 겹치는 파일(`docs/spec.md`, `docs/validation.md`)을 대조했고, 수정 구간이 서로 다른 섹션이라 `git merge-tree`와 실제 병합 모두 충돌 없이 끝났다
- 전달: 커밋 `59e1c77`, `e7e07af`와 병합 커밋을 `main`에 push했다 (`7cab32f`)
- 남은 일: B는 착수 전 `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md` §1(데이터 계약)을 검토해달라. 이후 B-1(Supabase `campaign_reservation` 테이블·repository)과 B-2(`lib/ai/campaignPrompts.ts` 신뢰 문구·OpenAI adapter)를 병렬로 진행하면 된다. `tests/e2e/demo-flow.spec.ts`의 3지선다 관련 검증은 A-1(화면) 단계에서 새 흐름 기준으로 재작성할 예정이라 지금 당장 손대지 않아도 된다.

## 2026-08-25 — 무과금 개발 모드와 OpenAI 문구 생성 adapter 준비

- 목적: 개발·발표 중 모델 과금을 없애면서, 사용자 입력에서 랜딩·캐러셀·게시 문구를 생성하는 OpenAI 경로를 실제 적용 직전 상태까지 준비한다.
- 변경: `CAMPAIGN_GENERATOR_MODE`를 추가해 API 키가 있어도 기본 `fixture`만 선택하도록 고정했다. 비활성 `OpenAICampaignGenerator`는 Responses API Structured Outputs 한 번으로 슬롯별 prompt를 실행하고, OpenAI 전용 배열 schema를 최종 `CampaignSpec`으로 재검증한다. 생성 메타데이터, legacy 판단·option 필드와 Figma 색상·시각 방향은 서버 값으로 덮어쓰며 timeout, 제한된 재시도, `store: false`, 비밀정보 없는 503을 적용했다. 작업 중 먼저 올라온 예약자명단 계약·화면 커밋 `cdfd232`를 병합하고 prompt version을 `campaign-spec-v2-reservations`로 올려 동의·수집 목적·구매 비보장 문구를 고정했으며 reference fixture와 입력 개인화 문구도 같은 계약으로 맞췄다. production E2E와 bundle smoke는 fixture를 강제하고 서버 키의 client bundle 비노출을 검사한다.
- 결정: OpenAI API에는 무료 문구 생성 모델이 없으므로 개발·테스트·발표는 외부 호출 0회의 fixture를 사용한다. live 후보만 비용이 낮고 Structured Outputs를 지원하는 `gpt-4o-mini`로 바꾸며, `openai` 모드를 명시적으로 켠 뒤부터 과금된다는 경계를 ADR-0014에 기록했다. 이미지 모델도 개발·발표에서 비활성화한다.
- 검증: OpenAI와 예약자명단 통합 focused 단위 테스트 33개, `pnpm check`의 lint·typecheck·단위 테스트 72개, configured production build와 server-secret client bundle smoke, production Chromium E2E 14개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 79.29%, branches 73.02%, functions 84.02%, lines 82.32%다. 실제 OpenAI API 요청은 수행하지 않아 호출과 과금은 0회다.
- 전달: OpenAI adapter 커밋 `fbdddc8`, 예약자명단 통합 `58d4dbc`, E2E 계획 통합 `d76d7c6`과 최종 동기화 `70b1c93`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32811937835`의 전체 gate가 통과했다. 실제 OpenAI 모드 활성화, API 요청, 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 회전한 키와 명시적 비용 승인 아래 대표 입력 3종·긴 한글·refusal 품질 eval을 통과한 뒤에만 `CAMPAIGN_GENERATOR_MODE=openai`로 전환한다. `CampaignSpec.validation.signal`은 현재 Meta·캐러셀 CTA export 호환을 위해 남아 있으므로 예약자명단 UI와 Supabase 계약이 안정된 뒤 별도 호환 migration으로 제거한다.

## 2026-08-25 — 예약자명단 전환과 OpenAI adapter 통합 및 E2E 복구

- 목적: 개발자 A가 `main`에 올린 예약자명단 계약·화면과 재작성 계획을 로컬 OpenAI adapter에 통합하고, 익명 3지선다 계약에 남아 있던 E2E를 실제 예약 흐름으로 복구한다.
- 변경: 원격 예약자명단 커밋 `cdfd232`와 계획 `e7d265c`를 각각 병합했다. `app/api/_lib/http.ts` 충돌은 삭제된 `InvalidSignalOptionError`만 제거하고 OpenAI 설정·생성 503 경계는 유지했다. prompt·reference fixture·예시 입력을 동의 기반 예약자명단 문구로 맞추고, E2E helper·API·종단·중복 이메일·빈 목록·375px 키보드·저장 실패·캠페인 격리·polling 시나리오를 `/api/reservations`와 예약자명단 리포트 기준으로 갱신했다. API cache 검증은 Next.js가 추가하는 private 지시를 허용하면서 `no-store`를 반드시 요구한다.
- 실패와 해결: route rename 뒤 실행 중이던 Next.js가 남긴 `.next/dev/types`가 삭제된 `/api/signals`를 참조해 typecheck가 실패했다. 생성 캐시를 작업 공간 밖 임시 백업으로 옮긴 뒤 `next typegen`으로 다시 생성했다. 첫 E2E는 옛 신호 assertion 6건과 종료 연쇄 실패가 났고, 예약 폼·리포트 계약으로 재작성한 뒤 14개가 통과했다.
- 영향 범위: 예약자명단·OpenAI 문구와 fixture, 제품·아키텍처 문서, `tests/e2e/demo-flow.spec.ts`, 단위 테스트와 팀 작업 기록
- 검증: focused 단위 테스트 5파일 33개, `pnpm check`의 lint·typecheck·단위 테스트 14파일 72개, configured production auth/server-secret bundle smoke, production Chromium E2E 14개, coverage, high audit, peer dependency, diff 검사가 모두 통과했다. 커버리지는 statements 79.29%, branches 73.02%, functions 84.02%, lines 82.32%다.
- 전달: 최종 동기화 커밋 `70b1c93`까지 비공개 `unithon26/marketvalley`의 `main`에 push했고 GitHub Actions run `32811937835`에서 install·lint·typecheck·단위 테스트 72개·configured auth bundle smoke·production build·Chromium E2E 14개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: G3 Supabase migration·RLS·repository에서 예약 원문을 광고 소유자에게만 반환하고 production OAuth 소유권을 연결한다. 공개 배포 전 사진 사용권과 실제 production URL 설정도 확인한다.
