# 외부 연동 현황

기준일: 2026-08-26

## Supabase

상태: 운영 적용 완료

- Google OAuth PKCE와 HttpOnly 세션
- `auth.uid()` 기반 캠페인·예약자명단 RLS
- 이름·이메일·동의, HMAC 이메일 중복 방지와 소유자 목록 마스킹
- 사용자 분당·일일·전체 일일 AI quota RPC
- Turnstile, canonical origin, 예약 campaign/global rate limit
- 계정별 lifecycle, service-role lease와 원자 상태 전이 RPC
- 운영 migration `202608250001`, `202608250002`, `202608260006`

운영 데이터에는 실제 진행 중인 캠페인 한 건만 남기고 발표·시험 행은 제거했다. fixture repository는 자동 테스트에서만 명시한다.

## Anthropic

상태: 운영 적용 완료

`AnthropicCampaignGenerator`는 Messages API Structured Outputs 한 번으로 허용된 평면 문구 슬롯과 template selector를 반환한다. 서버가 Figma 고정 필드, 생성 메타데이터와 안전성 정보를 조립한 뒤 최종 `CampaignSpec`을 다시 검증한다.

- 기본 모델: `claude-sonnet-4-6`
- 자동 재시도: 없음
- 사용자 입력: 명령이 아닌 별도 JSON 자료
- 실패: 성공 fixture로 대체하지 않고 lifecycle의 재시도·확인 필요 상태로 저장
- 과금 보호: Supabase 원자 quota 없이 production 호출 불가

## Meta Marketing API

상태: 팀 소유 운영 계정의 실제 광고 생성·활성화·Insights 수집 완료

worker는 서버 렌더 PNG 5장, 공개 랜딩 URL과 게시 문구로 `PAUSED` 객체를 만든 뒤 다음 조건을 다시 확인하고 활성화한다.

- 허용된 운영자 UUID
- 정확한 광고계정 ID
- 정확한 lifetime 예산
- 같은 광고계정에 다른 live run 없음
- Page와 Instagram identity binding

수집 중에는 Insights snapshot을 저장한다. 종료 시 child부터 parent 순서로 중지 상태를 확인하고 finalization delay 뒤 최종 snapshot과 리포트를 만든다. 사용자별 Meta OAuth, 결제수단 등록, 자동 예산 증액과 종료 광고 재시작은 구현하지 않는다.

## 배포

상태: Vercel·Oracle 운영 적용 완료

- 공식 사용자 앱: [marketvaley.vercel.app](https://marketvaley.vercel.app)
- Oracle: public NLB → Caddy → rootless Compose의 앱·1분 lifecycle worker
- source CI: lint, typecheck, 단위 테스트, auth bundle, build, E2E, 배포 파일·Terraform·container smoke
- owner-only deploy: 성공한 정확한 source SHA만 강제 명령 SSH gateway로 배포
- rollback: health가 확인되지 않으면 직전 release 유지 또는 복구

서버 secret은 Vercel 암호화 환경변수와 Oracle mode 0600 환경파일에만 두며 source 저장소, 브라우저 bundle과 로그에 기록하지 않는다.

## 남은 운영 확인

- 현재 실제 광고 수집 구간 종료 뒤 자동 pause, final snapshot과 `COMPLETED` 전이
- 행사 제출 형식·마감·발표 시간과 외부 자산 규정 확인
- 표본이 모인 뒤 실제 사용자 인터뷰와 제거된 수작업 단계 측정
