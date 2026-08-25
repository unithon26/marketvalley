# marketvalley

marketvalley는 아이디어를 처음 검증하려는 예비창업가와 초기 1인 사업자가 반복하던 광고 기획, 채널별 재작성, 조판, 파일 정리와 반응 취합을 하나의 흐름으로 없애는 UNITHON 2026 프로젝트다.

현재 저장소에는 Figma 디자인을 반영한 종단 데모가 있다. 카드뉴스 표지 3종과 랜딩 도입부 고정안 7종을 같은 `CampaignSpec`에서 선택하고, 입력에 명시한 상품명·핵심 특징과 문제·솔루션을 랜딩·카드뉴스·게시 준비 파일에 일관되게 반영한다. 제품 생성 기본 경로는 Anthropic Messages API의 Structured Outputs 한 번으로 랜딩 Hero·문제·혜택·단계·FAQ를 포함한 전체 광고 문구를 만든다. 자동 테스트와 외부 장애에 대비한 발표 fallback만 `CAMPAIGN_GENERATOR_MODE=fixture`를 명시해 결정적 결과를 사용한다.

## 실행

필요한 환경:

- Node.js 22 이상
- pnpm 10 이상

```bash
git clone https://github.com/unithon26/marketvalley.git
cd marketvalley
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
pnpm dev
```

개발 서버를 시작하면 `http://localhost:3000`에서 데모를 볼 수 있다. `pnpm check`는 lint, TypeScript와 단위 테스트를 검증한다. `pnpm test:e2e`는 코드를 새로 빌드한 뒤 전용 3100 포트의 `next start`로 실행해 Chromium에서 핵심 발표 흐름, API 오류 경계, 모바일·키보드, SEO·브랜드 대비와 두 ZIP의 실제 내용을 검증한다. 이미 실행 중인 개발 서버는 재사용하지 않는다.

실제 AI 문구 생성에는 서버 전용 `ANTHROPIC_API_KEY`와 Google 로그인이 필요하다. `.env.example`처럼 `CAMPAIGN_GENERATOR_MODE=anthropic`을 사용하며, 기본 모델은 현재 활성 Claude 중 가장 저렴한 `claude-haiku-4-5-20251001`이다. 테스트와 비상 발표에서만 `fixture`로 전환한다. Supabase 모드에서는 JSON·same-origin·로그인 검증 뒤 Postgres RPC가 사용자 분당·일일·전체 일일 quota를 원자적으로 적용한다. production Anthropic은 분산 제한 없이 실행되지 않는다.

## 발표용 경로

- `/`: 프로젝트와 사라지는 업무를 보여주는 홈
- `/new`: 배경과 상품명·핵심 특징을 포함한 솔루션을 받는 2단계 아이디어 입력
- `/campaigns/[id]/progress`: 게시된 광고의 결정적인 4단계 생성 진행 화면
- `/campaigns/[id]`: 예약자명단 리포트, PNG ZIP, PNG·문구·절대 URL이 든 Meta 게시 준비 ZIP과 다음 판단
- `/p/[slug]`: 동의 후 이름·이메일 사전예약을 받는 공개 랜딩
- `/auth/google`: Google 로그인을 시작하는 서버 endpoint
- `/api/auth/session`: 토큰을 노출하지 않고 현재 로그인 상태를 반환하는 endpoint
- `/login`: 비로그인 사용자가 광고 생성을 시작할 때 Google 로그인을 안내하고 원래 화면으로 복귀시키는 화면

서버 시작 시 발표용 `/campaigns/demo`와 `/p/demo`가 준비되며, `/new`에서 만든 광고는 기존 탭과 섞이지 않도록 별도 id와 slug를 받는다.

GNB의 Google 로그인·사용자·로그아웃 UI는 인증 상태 hook과 분리되어 있다. Supabase 설정이 있는 제품 환경에서 `/new`는 비로그인 사용자를 Figma 확정 로그인 화면으로 보내고, OAuth 완료 뒤 입력 화면으로 복귀시킨다. Supabase 설정이 비어 있으면 `로그인 준비 중`을 표시하며 fixture 데모에는 영향을 주지 않는다.

## 문서 안내

- [제품 브리프](docs/brief.md): 사용자, 사라질 일, 성공 기준
- [린캔버스](docs/lean-canvas.md): 고객, 문제, 솔루션과 BM 가설
- [MVP 스펙](docs/spec.md): P0/P1, 기능 계약, 분업, 구현 순서
- [아키텍처](docs/architecture.md): 현재 mock 경계와 후속 live adapter
- [기능 흐름](docs/user-flow-and-wireframes.md): Before/After와 화면별 기능 요구
- [협업 가이드](CONTRIBUTING.md): 브랜치, 파일 소유권, 통합 규칙
- [발표 실행서](docs/demo-runbook.md): 수동 데모 순서와 실패 대응
- [3분 발표 구성](docs/pitch-outline.md): 슬라이드·멘트·예상 질문
- [사업계획 초안](docs/business-plan.md): 고객 가치, BM 가설과 시장 진입
- [시장 리서치](docs/market-research.md): 공식 통계, 기관 채널과 TAM·SAM·SOM 원칙
- [외부 연동 계획](docs/integration-roadmap.md): Anthropic·Supabase 연결 순서
- [Google 로그인 운영 가이드](docs/authentication.md): redirect URI, Supabase 설정과 서버 인증 계약
- [목데이터 기준](docs/mock-data.md): fixture와 seed 응답 기준
- [검증 기록](docs/validation.md): 자동·수동 완료 기준과 확인 결과
- [결정 기록](docs/decisions/): 제품·아키텍처 선택과 기각 대안

## 범위 경계

- 예약자 수를 제외한 광고 성과 수치는 발표용 예시다. Claude 문구와 Supabase 데이터 adapter 코드는 연결했고, 운영 Supabase migration·live 종단, Meta와 배포 환경은 아직 연결하지 않았다.
- Google OAuth는 local Google·Supabase provider와 실제 계정 로그인·로그아웃까지 검증했다. production URL과 Vercel 환경변수는 아직 설정하지 않았고 기존 fixture 데모에는 로그인을 강제하지 않는다.
- P0는 명시적 동의 뒤 예약자명단 목적의 이름·이메일만 수집한다. 목록 화면의 이메일은 마스킹한다.
- Meta 계정 연결, 광고 활성화와 실제 지출은 해커톤 P0 범위에 넣지 않는다.
- 기본 fixture에서는 광고·예약자명단·판단이 Node.js 프로세스 메모리에만 남는다. 운영 migration과 server secret을 적용해 `CAMPAIGN_REPOSITORY_MODE=supabase`로 전환하면 계정 소유 RLS와 영속 저장을 사용한다.
- 응답 결과를 시장성 검증 완료나 매출 가능성으로 해석하지 않는다.
- 외부 API가 연결되더라도 광고 공개와 다음 행동 결정에는 사람이 남는다.

자세한 범위와 지표 정의는 [MVP 스펙](docs/spec.md)을 기준으로 한다.
