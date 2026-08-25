# 검증 기록

기준일: 2026-08-26

## 자동 검증

최종 로컬 검증:

```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm audit --audit-level high
```

결과:

- ESLint 경고·오류 없음
- Next.js route type 생성과 TypeScript 통과
- Vitest 41파일 212개 통과
- Next.js 16 production build 통과
- production Chromium E2E 6개 통과
- high 이상 알려진 의존성 취약점 없음
- staged diff 비밀정보 검사 통과

E2E는 매번 별도 production build를 전용 포트에 실행하고 기존 개발 서버를 재사용하지 않는다. 다음 경계를 실제 화면과 API로 확인한다.

- 첫 방문과 빈 계정에 더미 프로젝트·발표 문구·예시 입력 버튼이 없음
- 2단계 작성값의 이전·다음 이동 보존
- 접수부터 진행·결과 화면까지 이어지는 경로
- 진행 화면에 `메인으로`가 없고 리포트에 수동 Meta 제어가 없음
- 서버 PNG 5장의 1080×1350 크기와 같은 파일을 담은 ZIP
- 공개 랜딩 예약, 동의, 리포트 이메일 마스킹과 원문 비노출
- 로그인 계정의 새로고침 뒤 기존 진행·완료 상태 복원

GitHub Actions는 위 검사와 auth client bundle 비밀정보 비노출, 배포 shell 구문, Compose 렌더, OCI Terraform, production container build·smoke를 깨끗한 checkout에서 다시 실행한다.

## 운영 데이터와 lifecycle

운영 Supabase에 migration `202608260006`을 원자 적용했다.

- 캠페인 총 1건
- live lifecycle 1건
- live Meta run 1건
- 실제 캠페인 상태 `COLLECTING`
- 실제 Meta run 상태 `ACTIVE`
- lifetime 예산 5,000원
- `last_error_code` 없음

발표·시험 캠페인 5건은 정확한 ID를 대조한 뒤 운영 DB에서 삭제했다. 삭제는 cascade되며 Supabase backup 이외에는 복구되지 않는다. 이전 외부 Meta 초안은 DB와 분리해 `PAUSED` 상태를 유지했고 다시 활성화하지 않았다.

Vercel의 32바이트 이상 Bearer worker endpoint를 직접 호출해 due campaign 한 건을 처리했다. 호출 뒤 lifecycle은 `COLLECTING`을 유지했고 `next_attempt_at`이 갱신됐으며 실제 Meta Insights snapshot이 추가됐다. 조회 시점의 최신 실제 값은 노출·클릭·지출 0으로, 데이터가 생기기 전 값을 임의로 만들지 않았다.

## 운영 브라우저 검증

Chrome의 실제 Google 세션으로 [공식 서비스](https://marketvaley.vercel.app)를 확인했다.

- 홈에는 해당 계정의 실제 수집 중 광고 한 건만 표시됨
- `/new`에 예시 불러오기와 내부 fixture 문구가 없음
- 수집 중 프로젝트는 `시장 반응 데이터를 수집하고 있습니다`와 종료 예정 시각을 표시함
- 완료 전 `/campaigns/[id]` 접근은 progress로 되돌아감
- 실제 `/p/[slug]`가 생성된 상품명·문구·예약 폼과 Turnstile을 표시함
- 별도 `/campaigns/[id]/presentation`은 상단에 `24시간 수집 구간 스킵`, `발표용 수집 완료 예시`를 명시함
- 발표용 리포트도 실제 생성된 랜딩과 서버 카드 5장을 사용함
- `Ads Manager PAUSED 초안 만들기`, `실제 광고 활성화`, `광고 즉시 중지` 버튼이 없음

실제 예약 폼에는 시험 값을 제출하지 않아 운영 데이터에 더미 예약자를 추가하지 않았다.

## 배포 검증

- source PR CI와 `main` CI 성공
- Vercel `/api/health` 200, generator·repository·quota·reservations 모두 ready
- Vercel health의 version과 GitHub `main` 전체 SHA 일치
- owner-only 배포 저장소 CI 성공
- Oracle 배포는 성공한 source CI와 정확한 `main` SHA만 받도록 검증
- Oracle 외부 health와 `current` release가 배포 당시 source `main` 전체 SHA로 일치
- 앱 healthy, proxy running, lifecycle worker running 확인

첫 배포가 app·proxy만 명시적으로 시작해 worker를 누락한 사실을 운영 확인에서 발견했다. 같은 검증 image와 환경으로 worker를 즉시 시작했고, 배포 스크립트가 앞으로 app·worker·proxy를 모두 올린 뒤 worker running까지 검사하도록 수정했다.

worker를 시작했을 때 Oracle의 이전 `META_ADS_MODE=disabled` 설정이 실제 수집 캠페인을 `meta_configuration_error`로 실패 처리했다. Meta 광고의 `ACTIVE` 상태를 대조한 뒤 Oracle을 live 모드와 동일한 5,000원 예산으로 맞추고, 정확한 캠페인만 선행조건부로 `COLLECTING`에 복구했다. worker 재실행 뒤 오류가 사라지고 다음 Insights 수집 시각이 갱신됐다. 배포 preflight는 이제 production에서 live 모드를 필수로 하고 예산 불일치도 차단한다.

## 진실성·보안 경계

- API key, OAuth token, Supabase server key, Meta token과 worker secret은 Git·브라우저 bundle·문서에 없음
- Google 세션과 RLS가 광고·예약자명단 소유권을 검사함
- 이름·이메일은 동의 뒤에만 저장하고 목록에서 마스킹함
- 상태 이메일 발송 기능과 관련 환경변수·outbox가 없음
- 숨은 발표 초기화 API와 예약자 삭제 RPC를 제거하는 migration을 추가함
- 수집하지 않는 체류시간·인구통계, 업계 평균과 임의 성과를 표시하지 않음
- 예약·클릭을 시장성 또는 매출 가능성으로 자동 판정하지 않음

## 남은 관찰

현재 실제 수집 구간이 끝나는 2026-08-27 05:56 KST 이후 자동 pause, finalization delay, 최종 Insights snapshot과 `COMPLETED` 전이를 확인한다. 이 장기 관찰이 끝나기 전에는 실제 최종 리포트 자동 완성을 운영 완료로 주장하지 않는다.
