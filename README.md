# OneBrief

OneBrief는 아이디어를 처음 검증하려는 예비창업가와 초기 1인 사업자가 반복하던 캠페인 기획, 채널별 재작성, 조판, 파일 정리와 반응 취합을 하나의 흐름으로 없애는 UNITHON 2026 프로젝트다.

현재 저장소에는 제품 문서와 개발환경만 있다. 이전에 만든 임시 화면, mock 구현, API, fixture와 화면 테스트는 제품 디자인 기준으로 사용하지 않기 위해 모두 제거했다. 웹페이지 구현은 기존 GitHub 랜딩페이지 템플릿과 디자인 담당자가 전달할 메인 웹사이트 디자인을 확인한 뒤 시작한다.

## 현재 할 수 있는 작업

필요한 환경:

- Node.js 22 이상
- pnpm 10 이상

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm check
```

`pnpm check`는 현재 개발환경의 lint, TypeScript 설정과 빈 테스트 기준을 검증한다. 앱 엔트리가 없으므로 `pnpm dev`와 `pnpm build`는 아직 제공하지 않는다.

## 구현 시작 조건

다음 입력이 모이기 전에는 메인 웹사이트 화면을 만들지 않는다.

1. 기존 랜딩페이지 템플릿의 저장소와 기준 브랜치
2. 디자인 담당자의 메인 웹사이트 최종 프레임과 상태별 화면
3. 실제 개발자 이름과 파일 소유권
4. 발표 시간, 제출 형식과 심사 기준

화면 구현을 시작할 때는 템플릿을 먼저 통합하고 디자인 토큰과 컴포넌트 경계를 확정한 뒤 문서의 G0부터 순서대로 진행한다.

## 문서 안내

- [제품 브리프](docs/brief.md): 사용자, 사라질 일, 성공 기준
- [린캔버스](docs/lean-canvas.md): 고객, 문제, 솔루션과 BM 가설
- [MVP 스펙](docs/spec.md): P0/P1, 기능 계약, 분업, 구현 순서
- [목표 아키텍처](docs/architecture.md): 구현 예정 경계와 상태 흐름
- [기능 흐름](docs/user-flow-and-wireframes.md): Before/After와 화면별 기능 요구
- [협업 가이드](CONTRIBUTING.md): 브랜치, 파일 소유권, 통합 규칙
- [발표 실행서 초안](docs/demo-runbook.md): 구현 완료 후 사용할 수동 데모 순서
- [3분 발표 구성](docs/pitch-outline.md): 슬라이드·멘트·예상 질문
- [사업계획 초안](docs/business-plan.md): 고객 가치, BM 가설과 시장 진입
- [시장 리서치](docs/market-research.md): 공식 통계, 기관 채널과 TAM·SAM·SOM 원칙
- [외부 연동 계획](docs/integration-roadmap.md): OpenAI·Supabase 연결 순서
- [목데이터 계획](docs/mock-data.md): 향후 fixture와 seed 응답 기준
- [검증 계획](docs/validation.md): 구현 후 자동·수동 완료 기준
- [결정 기록](docs/decisions/): 제품·아키텍처 선택과 기각 대안
- [작업 기록](WORKLOG.md): 실제 변경과 검증 결과

## 범위 경계

- 현재 동작하는 웹페이지, API, mock 데이터와 배포본은 없다.
- P0는 개인정보를 받지 않는 선택형 관심 응답만 수집하도록 설계한다.
- Meta 계정 연결, 광고 활성화와 실제 지출은 해커톤 P0 범위에 넣지 않는다.
- 응답 결과를 시장성 검증 완료나 매출 가능성으로 해석하지 않는다.
- 외부 API가 연결되더라도 캠페인 공개와 다음 행동 결정에는 사람이 남는다.

자세한 범위와 지표 정의는 [MVP 스펙](docs/spec.md)을 기준으로 한다.
