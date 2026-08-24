# marketvalley

marketvalley는 아이디어를 처음 검증하려는 예비창업가와 초기 1인 사업자가 반복하던 캠페인 기획, 채널별 재작성, 조판, 파일 정리와 반응 취합을 하나의 흐름으로 없애는 UNITHON 2026 프로젝트다.

현재 저장소에는 Figma 디자인을 반영한 발표용 목데이터 종단 데모가 있다. 외부 API나 실제 광고 계정 없이 `아이디어 입력 → 가설 승인 → 생성 진행 → 결과물 → 공개 랜딩 응답 → 사람의 다음 판단`을 한 브라우저에서 재현한다.

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

개발 서버를 시작하면 `http://localhost:3000`에서 데모를 볼 수 있다. `pnpm check`는 lint, TypeScript와 단위 테스트를, `pnpm test:e2e`는 Chromium에서 핵심 발표 흐름과 ZIP 다운로드를 검증한다.

## 발표용 경로

- `/`: 프로젝트와 사라지는 업무를 보여주는 홈
- `/new`: 2단계 아이디어 입력과 가설 승인
- `/campaigns/demo/progress`: 결정적인 4단계 생성 진행 화면
- `/campaigns/demo`: 목 응답 리포트, PNG ZIP, Meta 게시 준비와 다음 판단
- `/p/demo`: 개인정보 없이 관심 신호 하나를 받는 공개 랜딩

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
- [외부 연동 계획](docs/integration-roadmap.md): OpenAI·Supabase 연결 순서
- [목데이터 기준](docs/mock-data.md): fixture와 seed 응답 기준
- [검증 기록](docs/validation.md): 자동·수동 완료 기준과 확인 결과
- [결정 기록](docs/decisions/): 제품·아키텍처 선택과 기각 대안

## 범위 경계

- 모든 화면과 수치는 발표용 mock이다. OpenAI, Supabase, Meta와 배포 환경은 연결하지 않았다.
- P0는 개인정보를 받지 않는 선택형 관심 응답만 수집하도록 설계한다.
- Meta 계정 연결, 광고 활성화와 실제 지출은 해커톤 P0 범위에 넣지 않는다.
- 브라우저 `localStorage`에 저장한 응답과 판단은 다른 기기와 공유되지 않는다.
- 응답 결과를 시장성 검증 완료나 매출 가능성으로 해석하지 않는다.
- 외부 API가 연결되더라도 캠페인 공개와 다음 행동 결정에는 사람이 남는다.

자세한 범위와 지표 정의는 [MVP 스펙](docs/spec.md)을 기준으로 한다.
