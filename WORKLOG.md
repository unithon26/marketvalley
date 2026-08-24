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
- 전달: 진행 중. 로컬 커밋, GitHub 원격과 CI 결과는 완료 후 갱신한다.
- 남은 일: 개발환경 검증과 독립 리뷰, 비공개 GitHub 저장소 푸시·CI 확인, 기존 랜딩페이지 템플릿 저장소 식별과 후속 구현
