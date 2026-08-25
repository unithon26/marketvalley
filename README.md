# marketvalley

marketvalley는 아이디어를 처음 검증하려는 예비창업가와 초기 1인 사업자가 반복하던 광고 기획, 채널별 재작성, 조판, 파일 정리와 반응 취합을 하나의 흐름으로 없애는 UNITHON 2026 프로젝트다.

제품은 Google 계정별 아이디어를 Supabase에 먼저 접수한 뒤 Claude 문구, 공개 랜딩, 서버 렌더 카드뉴스, 실제 Meta 광고 활성화, Insights 수집과 최종 리포트를 영속 lifecycle로 처리한다. 브라우저를 닫아도 worker가 계속 진행하고 다시 로그인하면 해당 계정의 현재 단계가 열린다. 제품 화면에는 seed 프로젝트나 예시 자동 입력을 넣지 않으며 fixture는 자동 테스트에서만 명시한다.

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

개발 서버는 `http://localhost:3000`에서 실행된다. `pnpm check`는 lint, TypeScript와 단위 테스트를 검증한다. `pnpm test:e2e`는 새 standalone build에서 빈 계정, 2단계 접수, 진행 복원, 결과, 서버 PNG·ZIP, 공개 예약과 마스킹 리포트를 확인한다.

실제 AI 문구 생성에는 서버 전용 `ANTHROPIC_API_KEY`와 Google 로그인이 필요하다. `.env.example`처럼 `CAMPAIGN_GENERATOR_MODE=anthropic`을 사용하며, 기본 모델은 대표 입력 품질 검사를 통과한 `claude-sonnet-4-6`이다. 테스트와 비상 발표에서만 `fixture`로 전환한다. Supabase 모드에서는 JSON·same-origin·로그인 검증 뒤 Postgres RPC가 사용자 분당·일일·전체 일일 quota를 원자적으로 적용한다. production Anthropic은 분산 제한 없이 실행되지 않는다.

## 발표용 경로

발표는 운영 저장소를 pull하지 않고 별도 비공개 저장소 `unithon26/marketvalley-presentation`의 tag `presentation-2026-08-25`를 사용한다. 새 clone에서 `pnpm install --frozen-lockfile && pnpm demo`만 실행하면 외부 계정 없이 fixture 흐름이 열린다. 운영 변경은 이 snapshot에 자동 반영하지 않는다.

- `/`: 프로젝트와 사라지는 업무를 보여주는 홈
- `/new`: 배경과 상품명·핵심 특징을 받는 2단계 입력과 실제 AI 생성·게시 진행 화면
- `/campaigns/[id]/progress`: 실제 DB lifecycle을 복원하는 진행 화면
- `/campaigns/[id]`: 최종 Insights·예약자명단 리포트, 실제 광고와 같은 PNG ZIP과 다음 판단
- `/p/[slug]`: 동의 후 이름·이메일 사전예약을 받는 공개 랜딩
- `/auth/google`: 제품에서는 Google OAuth를, 발표 mock 모드에서는 HttpOnly 데모 세션을 시작하는 endpoint
- `/api/auth/session`: 토큰을 노출하지 않고 현재 로그인 상태를 반환하는 endpoint
- `/login`: 비로그인 사용자가 광고 생성을 시작할 때 soft navigation은 현재 화면 위 로그인 모달, 직접 접근·새로고침은 전용 로그인 화면으로 안내하고 인증 뒤 원래 목적지로 복귀시키는 route

제품과 테스트 fixture 모두 `/new`에서 실제로 접수한 캠페인만 목록에 나타나며 각 캠페인은 별도 id와 slug를 받는다.

GNB의 Google 로그인·사용자·로그아웃 UI는 인증 상태 hook과 분리되어 있다. `NEXT_PUBLIC_AUTH_MODE=mock`인 발표 환경에서는 비로그인 상태의 `새 광고`가 메인 위 로그인 모달을 열고, Google 버튼이 외부 계정 없이 `마켓밸리 데모` HttpOnly 세션을 만든 뒤 메인으로 돌아온다. 로그인된 상태에서 `새 광고`를 다시 누르면 `/new`로 이동한다. `NEXT_PUBLIC_AUTH_MODE=supabase`인 제품 환경에서는 기존 Google OAuth와 PKCE callback을 그대로 사용한다.

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
- [Oracle production 배포](docs/deployment.md): 격리 Compose, owner-only 배포 자동화, health와 rollback
- [목데이터 기준](docs/mock-data.md): fixture와 seed 응답 기준
- [검증 기록](docs/validation.md): 자동·수동 완료 기준과 확인 결과
- [결정 기록](docs/decisions/): 제품·아키텍처 선택과 기각 대안

## 범위 경계

- 광고 지표는 저장된 Meta Insights와 실제 방문·예약만 표시하며 업계 평균이나 임의 수치를 만들지 않는다.
- Google OAuth production origin과 계정 세션을 사용하고 Supabase RLS가 캠페인·예약자명단 소유권을 검사한다.
- 공식 사용자 URL용 Vercel 프로젝트 `marketvaley`를 생성하고 Turnstile을 제외한 production 환경변수를 등록했다. 기존 Oracle VM의 Kubernetes·Traefik은 그대로 두고 OCI NLB·NSG·전용 50GiB volume, rootless Docker와 강제 명령 deploy gateway를 실제 적용했다. Oracle A1 capacity 부족으로 현재 사양은 2 OCPU·12GB이며 Compose 전체를 1.25 CPU·3GiB로 제한했다. 팀 source에는 운영 비밀을 두지 않고 개인 owner-only 저장소가 검토한 SHA만 Oracle에 배포한다. Vercel Git 권한, Turnstile·OAuth production 설정과 첫 앱 배포는 아직 완료하지 않았다.
- P0는 명시적 동의 뒤 예약자명단 목적의 이름·이메일만 수집한다. 목록 화면의 이메일은 마스킹한다.
- Meta 자동 활성화는 운영자 UUID, 정확한 광고 계정과 고정 lifetime 예산 확인값이 모두 일치할 때만 허용한다. 자동 예산 증액·종료 뒤 재시작·결제수단 등록은 하지 않는다.
- fixture repository는 자동 테스트의 한 Node.js 프로세스에만 존재하고 seed가 없다. 제품 기본 저장소는 Supabase다.
- 예약 결과를 시장성 검증 완료나 매출 가능성으로 해석하지 않는다.
- 외부 API가 연결되더라도 광고 공개와 다음 행동 결정에는 사람이 남는다.

자세한 범위와 지표 정의는 [MVP 스펙](docs/spec.md)을 기준으로 한다.
