# 작업 기록

## 2026-08-26 — 내부 광고 생성 일일 한도 대기 복구

- 목적: AI 문구 생성 뒤 서비스의 Meta operation 일일 안전 한도에 도달한 캠페인이 짧은 재시도를 소진해 실패하지 않고, 실제 원인과 재개 시각을 사용자에게 보여주며 자동 진행을 이어가게 한다.
- 원인과 변경: UTC 날짜 단위의 내부 quota를 일반 transient 오류와 같은 짧은 backoff와 3회 실패 상한으로 처리하고 있었다. 해당 quota 오류는 다음 UTC 날짜 시작 1분 뒤까지 `RETRY_WAIT`로 보존하고 canonical 오류 코드를 기록하도록 분리했다. 진행 화면과 대시보드에는 설정된 광고 생성 한도 대기와 상세 메시지를 표시하며, quota 대기에서 재개할 때만 시작 시각이 지난 수집 구간을 새 24시간 구간으로 계산한다.
- 영향 범위: lifecycle 오류 분류·재시도 시각, Meta 광고 일정 계산, 진행 화면·대시보드, 단위 테스트, ADR·아키텍처·장애 기록
- 검증: quota 시각·날짜 경계·legacy 오류 코드·실제 lifecycle 시도 상한·수집 구간·비 quota crash 복구 집중 테스트 4파일 25개가 통과했다. 전체 lint·typecheck·단위 테스트 44파일 230개, configured client bundle production build, Chromium E2E 7개, high audit와 diff 검사도 통과했다. 독립 재검토에서 차단급 잔여 결함은 없었다.
- 전달과 남은 일: 변경은 로컬 브랜치에 있다. 독립 검토, source PR·CI와 배포 승인을 거쳐 전달한다. 이미 실패 상태가 된 운영 캠페인은 정확한 상태를 확인한 뒤 별도 승인 아래 안전하게 재개해야 한다.

## 2026-08-26 — 심사위원용 공개 저장소 정리

- 목적: 저장소 첫 화면과 문서 구조에서 현재 제품·아키텍처·검증 근거를 빠르게 찾게 하고, 완료된 내부 작업 흔적과 운영에서 제거된 목데이터 설명을 없앤다.
- 변경: README 문서 진입점을 제품·발표·검증 중심으로 줄이고 `docs/README.md`에 목적별 문서 지도를 추가했다. 루트에 중복되던 개인 작업·트러블슈팅 로그 3개, 완료된 내부 구현 계획 4개와 더 이상 사실이 아닌 목데이터 문서 1개를 제거했다. 공식 ADR, 통합 작업 기록, 실제 장애 기록과 운영 문서는 보존했다.
- 검증·전달: 끊어진 Markdown 링크, 추적 파일의 내부 도구 표현과 Git diff를 확인한 뒤 source PR·CI·병합으로 전달한다.
- 남은 일: 없음.

## 2026-08-26 — 캠페인별 Meta 동시 집행 전환

- 목적: 실제 광고 1건이 수집 중일 때 뒤 광고가 `AWAITING_ACTIVATION`에 머무는 계정 전체 직렬화 병목을 제거한다.
- 원인과 변경: Meta 제한이 아니라 자체 partial unique index와 worker 조회가 광고계정당 live run을 하나로 제한하고 있었다. 캠페인마다 운영자·계정·고정 lifetime 예산·종료 시각을 이미 검증하므로 계정 전체 제한을 제거하고 독립된 run과 Insights로 동시 집행하도록 바꿨다. ADR-0024와 발표·운영 문서를 같은 경계로 갱신했다.
- 운영 상태: 기존 실제 광고 1건은 `ACTIVE`, 뒤의 두 광고는 실제 Meta 객체가 모두 만들어진 `PAUSED` 상태다. migration과 새 worker 배포 뒤 두 건의 `ACTIVE`·`COLLECTING` 전이를 확인한다.
- 검증·전달: focused lifecycle·migration 테스트 2파일 9개와 lint·typecheck·전체 단위 테스트 42파일 221개가 통과했다. 운영 Supabase에 migration `202608260009`을 적용하고 remote 이력 일치를 확인했다. source PR·CI·병합과 Vercel·Oracle exact-SHA 배포를 이어서 수행한다.
- 남은 일: 세 광고의 실제 상태와 각 캠페인별 Insights snapshot을 확인하고 최초 수집 종료 뒤 최종 리포트 전이를 검증한다.

## 2026-08-26 — 프로젝트 삭제와 AI 안전성 오탐 복구

- 목적: 첫 화면에서 소유 프로젝트를 정리할 수 있게 하고, Claude 문구 생성이 같은 `anthropic_unsafe_output`을 반복해 `RETRY_WAIT`에 머무는 운영 문제를 해결한다.
- 원인과 변경: 운영 입력과 생성 원문을 노출하지 않은 재현에서 차단 대상이 본문이 아니라 `hashtags[4]`의 입력에 없는 시간 절감 표현임을 확인했다. 서버가 해당 해시태그만 제거한 뒤 나머지 문구를 검증하도록 바꾸고, 동일 출력이 반복되는 안전성 거절은 transient 재시도 대신 영구 오류로 분류했다. 홈 카드에는 확인형 삭제 버튼을 추가했다. 새 owner RPC는 row lock, worker lease, Meta run과 operation을 확인하며, run이 있으면 삭제 직전 Meta Graph의 campaign·ad set·ad도 모두 `PAUSED`인지 재검증한다.
- 운영 관찰: 새 접수 2건 중 1건은 기존 worker 재시도에서 `AWAITING_ACTIVATION`까지 진행했고, 1건은 3회 오탐 뒤 `FAILED`에 남았다. 수정 배포 뒤 실패 건만 저장된 입력으로 재개한다. 기존 실제 수집 캠페인은 계속 `COLLECTING`이다.
- 검증: focused 4파일 31개, lint, typecheck, 전체 단위 테스트 42파일 220개와 production build 기반 Chromium E2E 7개가 통과했다. E2E는 여러 동명 프로젝트 중 선택한 한 건만 삭제되고 목록에 즉시 반영되는지 확인한다.
- 전달: 운영 Supabase에 migration `202608260008`을 적용하고 remote 이력 일치를 확인했다. source PR·CI·병합, Vercel·Oracle exact-SHA 배포와 운영 실패 건 복구를 이어서 수행한다.
- 남은 일: 실제 수집 종료 뒤 자동 pause·final snapshot·`COMPLETED` 전이 확인.

## 2026-08-26 — Oracle lifecycle worker와 Meta production 계약 복구

- 목적: source 배포가 성공해도 lifecycle worker가 시작되지 않거나 Meta 비활성 환경이 실제 수집 캠페인을 실패 처리하는 운영 불일치를 제거한다.
- 변경: release activation 대상에 `lifecycle-worker`를 포함하고 running 확인을 성공 조건으로 추가했다. production preflight는 이제 `META_ADS_MODE=live`를 필수로 하며 기존 account·credential·원장·자동 활성화·예산 일치 검사를 함께 적용한다. Oracle 환경의 Meta 모드와 두 예산을 실제 운영값으로 맞췄다.
- 복구: worker 시작 직후 `meta_configuration_error`로 실패한 정확한 캠페인과 기존 `ACTIVE` Meta run을 대조했다. 외부 광고는 건드리지 않고 선행조건 SQL로 내부 상태만 `COLLECTING`에 복구한 뒤 worker를 실행해 오류 해제와 다음 수집 예약을 확인했다.
- 추가 보강: 첫 수정 배포 뒤 app은 새 SHA지만 worker가 실행 중인 이전 SHA image를 유지한 사실을 발견했다. worker를 즉시 새 image로 재생성하고, 이후 배포는 worker를 항상 `--force-recreate`한 뒤 running과 exact image SHA를 함께 검사하도록 고쳤다.
- 환경 정합성: 강화된 preflight가 서로 다른 두 Meta 광고계정 환경값을 차단했다. 운영 DB의 실제 `ACTIVE` run과 자동 활성화 계정이 일치함을 확인하고 기본 계정 값을 같은 ID로 맞췄으며 변경 전 root-only 환경파일을 보존했다.
- 검증: source shell syntax와 배포 trust-boundary 테스트 3파일 11개, owner-only control-plane shell syntax와 테스트 4개가 통과했다. app healthy, proxy와 worker running, 동일 release image, 캠페인 `COLLECTING`과 오류 없음도 운영에서 확인했다.
- 전달: source와 control-plane 변경을 각각 CI·병합한 뒤 exact-SHA Oracle 재배포로 새 preflight와 worker 성공 조건을 다시 확인한다.
- 남은 일: 2026-08-27 05:56 KST 수집 종료 뒤 자동 pause·final snapshot·`COMPLETED` 장기 관찰.

## 2026-08-26 — 발표 초기화 경계 제거와 제출 저장소 정리

- 목적: 운영 화면에서 제거한 더미·수동 기능의 숨은 API까지 없애고 심사위원이 저장소 첫 화면에서 제품 가치와 실제 구현·검증을 이해하게 한다.
- 변경: 과거 발표용 `/api/campaigns/reset`, repository reset 계약과 예약자 삭제 RPC를 제거하는 migration `202608260007`을 추가했다. README를 라이브 서비스, 사라지는 일, 실제 lifecycle, Mermaid 아키텍처, 검증·진실성 경계 중심으로 재작성했다. brief, spec, user flow, pitch, lean canvas, business plan, architecture, integration, demo와 validation 문서를 실제 Meta·Supabase·Vercel·Oracle 구현 기준으로 갱신했다.
- 검증: reset route·계약 잔여 검색, typecheck와 focused repository 테스트 8개를 통과했다. 최종 `pnpm check`에서 41파일 212개, production build, Chromium E2E 6개와 high audit가 통과했다. 실제 Chrome 세션에서 계정별 수집 중 화면, 완료 전 redirect, 실제 공개 랜딩과 명시적 발표용 완료 예시를 확인했다.
- 전달: 기능·문서 PR, 운영 reset RPC 제거 migration, 수정된 Vercel·Oracle 재배포와 GitHub 저장소 메타데이터 정리는 이어서 완료한다. 첫 Oracle exact-SHA 배포 뒤 worker 누락을 발견해 같은 검증 release에서 즉시 시작했고 재발 방지 gate를 추가했다.
- 남은 일: 실제 수집 종료 뒤 자동 pause·final snapshot·`COMPLETED` 장기 관찰.

## 2026-08-26 — 계정별 광고 생성·집행·집계 lifecycle 전환

- 목적: 더미 프로젝트와 수동 Meta 조작을 제거하고, Google 계정별 접수부터 실제 광고·집계·최종 리포트까지 브라우저와 무관하게 이어지는 제품 경로를 완성한다.
- 변경: `/api/campaigns`를 DB 선접수 방식으로 바꾸고 Supabase lease 상태 머신, 1분 Oracle worker와 Vercel fallback cron, Claude 생성, 공개 slug, 서버 `ImageResponse` 카드뉴스 5장, Meta PAUSED 생성·exact 계정/예산 승인·ACTIVE 확인, Insights 중간·최종 snapshot, 완료 리포트를 연결했다. 로그인 대시보드는 계정 데이터만 불러오며 진행 화면은 DB 상태를 복원한다. 예시 불러오기, 메인으로, 수동 PAUSED 초안·활성화·중지 UI/API와 기본 fixture seed를 제거했다. 사용자의 후속 지시에 따라 상태 이메일 구현은 전부 제외했다.
- 안전: 이전 캠페인은 migration에서 먼저 `ARCHIVED` 처리하고 실제 Meta run만 복원한다. 동일 광고 계정 live run 하나를 DB index와 실행 전 조회로 제한한다. 운영 DB의 발표·시험 캠페인 5개를 정확한 ID로 삭제했고 실제 ACTIVE 캠페인 1개는 보존했다. 이전 외부 Meta 초안은 PAUSED 상태 그대로 변경하지 않았다.
- 검증: `pnpm check`에서 lint·typecheck와 단위 테스트 41파일 215개가 통과했다. production build를 포함한 Chromium E2E에서 빈 계정, 입력 보존, 접수·결과, 1080×1350 PNG 5장과 ZIP, 공개 예약·마스킹 리포트, 로그인 뒤 상태 복원을 확인했다. 실제 Meta campaign·ad set·ad가 모두 `ACTIVE`, lifetime 예산 5,000원, 2026-08-27 05:56 KST 종료로 확인됐다. 운영 worker 직접 호출 뒤 lifecycle `COLLECTING`, 새 Insights snapshot과 오류 없음도 확인했다.
- 전달: PR #17을 merge SHA `21562e73`으로 병합했고 source PR CI `32909332665`, main CI `32909555558`과 Vercel production health가 성공했다. 운영 migration `202608260006`과 자동 활성화 환경을 적용했으며 같은 SHA의 Oracle owner-only 배포 run `32909954027`을 실행했다.
- 남은 일: Oracle 배포 완료와 실제 수집 종료 뒤 자동 pause·final snapshot·`COMPLETED` 장기 관찰.

## 2026-08-26 — 아이디어 입력 내부 실행 문구 제거

- 목적: 사용자용 아이디어 입력 화면에서 데모 실행 방식 안내를 노출하지 않는다.
- 변경: fixture 모드의 `안전 데모 · AI 호출 없음` 문구를 제거하고, 운영 AI 설정 오류 안내는 기존대로 유지했다.
- 검증: 관련 E2E의 기대값을 문구 미노출로 변경하고 저장소 CI로 확인한다.
- 전달: 메인 `main` 병합·배포 후 발표용 `main`과 로컬 fixture 서버에도 동일하게 반영한다.
- 남은 일: CI와 배포 완료 확인.

## 2026-08-26 — Figma 진행 화면과 대기 반응성 결합

- 목적: 공유 Figma의 진행 화면을 그대로 유지하면서 사용자가 기다리는 상태를 느낄 수 있는 반응성을 메인과 발표용에 동일하게 적용한다.
- 변경: Figma의 흰 배경, 문구, 일러스트·진행 카드 치수, ETA, 단계선과 버튼을 복원했다. 레이아웃을 바꾸지 않는 범위에서 단계 문구 진입, 일러스트 부유, ETA 호흡, 진행선 전환, 활성 단계 pulse를 추가했고 완료 상태에서는 반복 모션을 멈춘다.
- 검증: 사용자의 최신 지시에 따라 반복 로컬 검증은 생략하고 저장소 CI와 배포 health로 확인한다.
- 전달: 메인 PR 병합·운영 배포와 발표용 `main` push 및 로컬 fixture 재시작을 진행한다.
- 남은 일: CI와 운영 배포 완료 확인.

## 2026-08-26 — Figma 진행 화면 반응형 구현

- 목적: 아이디어 제출 뒤 기다리는 진행 화면을 전달된 Figma 원본과 동일하게 구현하고 작은 화면에서만 자연스럽게 재배치한다.
- 변경: Figma의 진행 상태 프레임 4개를 직접 대조해 일러스트, 제목·설명, `결과 도착까지 24시간` 배지, `접수 → 준비 중 → 수집 중 → 결과 도착` 단계선, `메인으로`와 완료 CTA의 문구·간격·색상·그림자·크기를 복원했다. Figma에 없는 배경 장식과 애니메이션은 제거했다. 실제 `/api/generate`와 `/api/campaigns` 응답 경계는 유지해 게시 응답 전에는 완료 CTA를 표시하지 않고, 직접 진행 URL은 이미 게시된 광고의 완료 프레임을 바로 보여준다.
- 접근성과 반응형: 화면에 보이지 않는 안정적인 live region과 단계 제목 포커스를 유지했다. 640px 이하에서는 Figma의 시각 위계를 보존하면서 여백, 일러스트, 카드, 글자와 단계 라벨만 축소해 375px에서도 가로 넘침 없이 표시한다.
- 문서와 테스트: 진행 단계 계약을 Figma의 `접수 → 준비 중 → 수집 중 → 결과 도착`으로 동기화했다. E2E는 실제 generate·publish 응답을 보류해 조기 완료가 없는지 확인하고 375px 진행 화면의 overflow와 단계 접근성을 검증한다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 41파일 223개, production build를 포함한 Chromium E2E 23개, coverage, high audit, dependency 목록과 diff 검사가 통과했다. 커버리지는 statements 85.34%, branches 77.99%, functions 92.51%, lines 88.49%다. 실제 브라우저에서 1440×1024와 375×812 완료 화면을 대조했고, 독립 리뷰에서 확인한 완료 진행선과 1.6초 이탈 취소 테스트를 보완했다.
- 전달: `main` push와 Vercel production 자동 배포 결과는 완료 뒤 기록한다.

## 2026-08-26 — Meta v26 운영 생성 필수 계약과 앱 게시 준비

- 목적: 운영 `PAUSED` 초안의 캠페인·크리에이티브 생성이 Meta v26 필수 파라미터와 앱 개발 모드에서 중단된 문제를 복구한다.
- 변경: ad set 예산 캠페인에 `is_adset_budget_sharing_enabled=false`를 명시하고, 현재 Business SDK 계약에 맞춰 크리에이티브 identity를 `instagram_user_id`로 보낸다. Meta 앱 게시 필수 조건과 실제 사용자 정보 처리 경계를 충족하는 공개 `/privacy` 페이지를 추가했다.
- 운영 확인: 기존 operation에서 이미지 5장, 캠페인, 광고 세트까지 생성·checkpoint를 확인했다. 캠페인과 광고 세트는 `PAUSED`이며 크리에이티브·광고는 아직 생성되지 않았다.
- 검증·전달: focused provider·migration 테스트와 lint·typecheck, 배포, 앱 Live 전환, 남은 객체 생성 결과는 완료 뒤 갱신한다.
- 남은 일: 변경을 production에 배포하고 개인정보처리방침 URL을 Meta 앱에 등록해 앱을 게시한 뒤 크리에이티브·광고를 `PAUSED`로 완성한다.

## 2026-08-26 — Meta 운영 원장 외부 ID 검증 복구

- 목적: 첫 운영 `PAUSED` 초안 생성에서 Meta 이미지 업로드 뒤 체크포인트 저장이 중단된 원인을 제거하고, 이미 만들어진 자산을 중복 생성하지 않고 이어서 처리한다.
- 변경: PostgreSQL 정규식 반복 상한을 넘던 `{5,256}` 검사를 문자 허용 정규식과 `char_length` 범위 검사로 분리하는 후속 migration `202608250004`를 추가했다. 전환·조정 RPC의 권한과 상태 전이 계약은 유지했다.
- 검증: focused migration 계약 테스트로 256자 상한, 허용 문자와 기존 잘못된 반복식 제거를 확인한다. 운영 적용과 첫 이미지 checkpoint 조정, 나머지 Meta 객체 생성 결과는 완료 뒤 갱신한다.
- 전달: 운영 migration 적용과 Git 전달 전이다.
- 남은 일: 운영 DB에 migration을 적용하고 확인된 첫 이미지 hash를 감사 기록과 함께 원장에 복구한 뒤 캠페인·광고 세트·크리에이티브·광고를 모두 `PAUSED`로 완성한다.

## 2026-08-26 — Vercel·Oracle Compose 운영 배포 완료

- 목적: 발표 snapshot과 분리된 메인 제품을 공식 Vercel URL과 기존 Oracle VM의 Kubernetes 밖 Compose 환경에 같은 검증 source로 배포한다.
- 변경: Vercel 프로젝트의 Next.js framework·Git 연동·운영 환경변수·Turnstile을 구성했다. Oracle에서는 rootless BuildKit의 현재 OCI worker flag를 적용하고 NLB private IP만 UFW의 `13080`·`13443`에 허용해 기존 K3s와 host 80·443을 건드리지 않는 ingress를 완성했다. Caddy를 재시작해 공개 TLS 인증서를 발급했다.
- 검증: source `cfc1b79`의 GitHub Actions run `32874885005`와 control-plane CI run `32874809786`이 성공했다. Vercel production `/api/health`와 Oracle `https://marketvalley-152-67-213-96.sslip.io/api/health`가 같은 전체 SHA를 반환했고 Anthropic·Supabase repository·분산 quota·Turnstile이 모두 ready였다. Oracle에서 앱은 healthy, proxy와 K3s는 active 상태다.
- 전달: 공식 제품은 `https://marketvaley.vercel.app`, 독립 Oracle 배포는 `https://marketvalley-152-67-213-96.sslip.io`에서 동작한다. Meta 자동화의 운영 migration·secret·광고 객체 생성은 제외했다.
- 남은 일: 행사 발표 시간·제출 형식과 카드 표지 사진 사용권을 운영진·원저작자에게 확인한다. Oracle A1 capacity가 확보되면 현재 2 OCPU·12GB를 원래 4 OCPU·24GB로 복구한다.

## 2026-08-26 — Meta PAUSED 초안 운영 수명과 확인 경로 보강

- 목적: Meta 연결을 켠 배포가 고정 광고 일정 만료로 비활성화되지 않게 하고, Oracle·Vercel 어느 화면에서 생성해도 공식 공개 랜딩으로 연결하며 생성 결과를 Ads Manager에서 바로 확인한다.
- 변경: 고정 `META_DRAFT_STARTS_AT`·`META_DRAFT_ENDS_AT` 대신 요청 시각 기준 10분 후부터 기본 24시간인 상대 일정을 사용한다. 서버 계산 일정만 durable operation 지문에서 제외해 기존 checkpoint와 중복 방지를 유지한다. destination은 요청 deployment가 아니라 `META_ALLOWED_DESTINATION_ORIGIN`으로 고정했다. 성공 응답은 비밀값 없이 Meta campaign·ad set·creative·ad ID와 광고계정 Ads Manager 링크를 반환하고 결과 화면에 확인 링크를 표시한다. 기존 production 환경과의 호환성을 위해 누락된 `META_ADS_MODE`는 `disabled`로 처리하고, `live`일 때만 배포 스크립트가 원장·운영자·자산·예산·일정·secret을 fail-closed 검증한다. 환경 예시, 운영 가이드와 ADR-0021을 같은 계약으로 갱신했다.
- 검증: focused 단위 테스트 4파일 36개, `pnpm check`의 lint·typecheck·단위 테스트 41파일 223개, configured server-secret client bundle smoke, production build, Chromium E2E 22개, coverage, high audit, peer dependency와 diff 검사가 통과했다. 커버리지는 statements 85.34%, branches 77.99%, functions 92.51%, lines 88.49%다. 배포 스크립트 구문과 diff도 확인했다. 실제 Meta 객체는 만들지 않았다.
- 전달: PR #6의 code CI와 Vercel preview, 개인 owner-only 배포 제어 CI가 통과했다. 운영 Supabase에 migration `202608250003`을 적용했고 Oracle `production.env`에 Meta 자산·운영자·예산·상대 일정과 Keychain의 token·App Secret을 mode 0600으로 등록했다. `META_ADS_MODE=disabled`를 유지해 아직 Meta 쓰기와 서버 재시작은 발생하지 않았다.
- 남은 일: 최신 `main`을 통합한 PR #6을 병합·배포하고 읽기 preflight → `PAUSED` 1건 → 중복 요청 → Ads Manager 상태·지출 0원을 검증한다.

## 2026-08-26 — Meta 최소 권한 token과 고정 Page 직접 검증

- 목적: 회사 System User token에 Page 광고 권한을 보완하고, 실제 Meta 자산에서 `PAUSED` 초안 생성 전 검증이 유효한 고정 Page를 잘못 거절하지 않게 한다.
- 변경: 앱 use case에 `pages_manage_ads`를 추가하고 `ads_management`, `ads_read`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`를 가진 60일 token을 발급해 로컬 Keychain에 저장했다. provider는 빈 `promote_pages` 간접 목록 대신 광고계정 ID, 고정 Page 직접 조회, Page→Instagram ID와 광고계정 Instagram 목록을 순서대로 대조한다. 운영 가이드, ADR-0021과 troubleshooting 기록도 실제 응답에 맞췄다.
- 운영 확인: 새 token의 5개 권한, 활성 광고계정의 `KRW`·`Asia/Seoul`, System User의 `MANAGE`·`ADVERTISE` task, 지정 Page와 Page→Instagram 쌍, 광고계정 Instagram identity를 Graph v26에서 확인했다. token과 App Secret 값은 출력·문서·저장소에 남기지 않았다. 기존 2개 권한 token은 선택 취소 수단이 없어 새 token까지 전체 취소하지 않고 미사용 상태로 만료시킨다.
- 검증: provider focused 테스트 13개, `pnpm check`의 lint·typecheck·단위 테스트 41파일 220개, configured server-secret client bundle smoke, production build, Chromium E2E 22개, coverage, high audit, peer dependency와 diff 검사가 통과했다. 커버리지는 statements 85.37%, branches 78.16%, functions 92.53%, lines 88.52%다. 실제 광고 객체와 지출은 만들지 않았다.
- 전달: 기능 commit `43b079f`를 PR #5로 병합했다. PR Actions run `32874335035`와 main run `32874741143`이 통과했고 Vercel health에서 merge SHA `897313b`를 확인했다.
- 남은 일: migration과 Oracle Meta secret·운영자 설정은 후속 작업에서 적용했다. 새 코드를 배포한 뒤 읽기 preflight와 실제 `PAUSED` 초안 하나의 상태·중복 방지·지출 0원을 검증한다.

## 2026-08-26 — 공개 source 기반 Vercel Git 연결과 Turnstile 운영 설정

- 목적: 공식 `marketvaley.vercel.app`과 Oracle Compose 배포가 같은 source SHA를 사용하고, 예약 폼의 운영 봇 방어와 Vercel 자동 배포를 연결한다.
- 변경: Cloudflare Turnstile `marketvalley-production` 위젯을 생성해 Vercel·Oracle HTTPS hostname 두 개만 허용하고 site·secret key를 각 운영 환경에 등록했다. Vercel GitHub App은 `unithon26/marketvalley` 한 저장소에만 설치했다. Vercel Hobby가 조직 비공개 저장소 연결을 거부해 사용자 승인 아래 저장소를 공개로 전환하고 Git 연동을 완료했다. Terraform provider와 로컬 산출물이 Vercel CLI 업로드에 섞이지 않도록 `.vercelignore`를 추가하고 결정 근거를 ADR-0022에 기록했다.
- 검증: Git 이력 86개 커밋을 `gitleaks git --redact`로 검사했다. 탐지 3건은 모두 같은 단위 테스트용 고정값 `0123456789abcdef` 반복으로 확인했고 실제 자격증명은 없었다. source SHA `c1dde07`의 GitHub Actions run `32870843617`이 성공했으며, Vercel production 환경변수 19개와 Oracle Turnstile 두 키의 형식·파일 권한을 값 노출 없이 확인했다.
- 전달: `unithon26/marketvalley`는 공개 저장소가 됐고 Vercel 프로젝트 `marketvaley`와 연결됐다. Turnstile secret은 Git·로그·문서에 기록하지 않았다.
- 남은 일: 이 변경을 push해 Vercel Git production 배포를 시작하고 공식 URL의 health·OAuth·예약 종단을 검증한다. 같은 green source SHA를 Oracle owner-only workflow로 배포해 NLB·TLS·rollback을 확인한다.

## 2026-08-26 — Oracle Compose 운영 기반 적용과 접근 복구

- 목적: 기존 `ssumcp`의 Kubernetes와 분리된 NLB·전용 볼륨·rootless Docker 운영 기반을 실제 OCI에 적용하고 owner-only GitHub 배포 경로를 서버까지 연결한다.
- 변경: Tailscale SSH로 기존 관리 경로를 확인한 뒤 `ubuntu`에 새 관리자 Ed25519 공개키를 추가하고 공개 IP 직접 접속을 검증했다. OCI Resource Manager 1.5 stack `marketvalley-oracle-compose`를 만들고 public NLB, NSG 2개와 규칙 6개, backend set·backend·listener 각 2개, `prevent_destroy` 50GiB Block Volume을 적용했다. 기존 VNIC의 NSG 목록을 mode 0600으로 백업한 뒤 backend NSG 하나만 append했다. 빈 비부팅 볼륨을 ext4로 만들고 `/opt/marketvalley`에 UUID mount했으며 전용 `marketvalley` 사용자, rootless Docker 29.7.2, 제한된 SSH deploy gateway를 설치했다. 4 OCPU·24GB와 3 OCPU·18GB 복구가 모두 capacity 부족으로 거절된 뒤 K3s 요청이 2 OCPU의 96%임을 확인해 Compose 전용 cgroup을 125% CPU·3GiB·swap 0·1024 task로 낮추고 실제 서버에 재적용했다. NLB IP를 해석하는 `marketvalley-152-67-213-96.sslip.io`와 GitHub deploy secret·variable을 연결하고 서버 환경파일에 Anthropic·Supabase·새 signal secret을 값 노출 없이 설치했다. 공식 URL용 Vercel 프로젝트 `marketvaley`를 만들고 Turnstile을 제외한 production 환경변수 17개를 등록했다.
- 실패와 수정: maintenance stop 뒤 춘천 A1 capacity 부족으로 4 OCPU·24GB 시작이 거절돼 1·6으로 복구한 뒤 2·12까지 증설했다. Resource Manager 1.5의 교차 변수 validation 미지원은 resource precondition으로 옮겼다. A1이 paravirtualized 전송 중 암호화를 지원하지 않아 attachment만 실패한 뒤 해당 옵션을 끄고 OCI 저장 암호화는 유지했다. NSG 스크립트의 잘못된 OCI CLI 옵션 `--network-security-group-id`를 `--nsg-id`로 고쳤다. 17자 ext4 label이 16자로 잘려 bootstrap이 중단된 문제는 label 계약을 `marketvalley`로 수정하고 신규 빈 볼륨 label만 보정했다. 누락된 `production.env.example`을 bootstrap 묶음에 추가해 idempotent 재실행을 완료했다.
- 검증: 첫 plan은 신규 17개와 기존 변경·삭제 0개였고, attachment 수정 plan은 기존 16개 `no-op`과 attachment 1개 `create`였다. 최종 NLB `ACTIVE`, 볼륨 `ATTACHED`, VNIC backend NSG 포함, 서버의 50GiB 비부팅 디스크·ext4 UUID mount, K3s node `Ready`, rootless Docker socket·data-root·자동 시작, deploy key 강제 명령 도달과 환경파일 owner `marketvalley`, mode 0600을 실제 확인했다. 서버 cgroup은 CPU `125000 100000`, memory `3221225472`, swap `0`으로 확인했다. Terraform fmt·init·validate와 NSG shell 구문, source·control repository의 resource 회귀 테스트와 Compose render를 통과했고 control CI run `32868215911`이 성공했다.
- 전달: OCI Resource Manager가 Terraform state를 관리한다. 개인 배포 저장소에는 production SSH host·user·port·private key·known hosts와 production URL, source read token이 모두 등록됐다. 발표 저장소는 변경하지 않았다.
- 인증 운영: Supabase Site URL을 공식 Vercel origin으로 바꾸고 local·Vercel·Oracle callback을 allow-list에 등록했다. Google Authorized JavaScript origin에도 local·Vercel·Oracle을 등록했다. Google client 상세 점검 중 기존 secret 원문이 접근성 정보에 포함된 것을 잠재 노출로 간주해 새 secret 생성 → Supabase provider 반영 성공 → 기존 secret 비활성화·삭제 순서로 무중단 회전하고 임시 버퍼를 정리했다.
- 남은 일: Cloudflare CAPTCHA 뒤 Turnstile key를 만들고 GitHub Mobile sudo 승인 뒤 Vercel GitHub 비공개 저장소 권한을 연결한다. 실제 main SHA를 두 대상에 배포하고 production OAuth·Claude·예약·export·rollback과 재부팅 복구를 검증한다. Oracle 4·24 capacity는 별도로 재시도한다. Meta 자동화는 제외한다.

## 2026-08-25 — Meta 최소 권한 계정 기반과 PAUSED 광고 초안 구현

- 목적: 회사 소유 Meta 자산에서 내부 운영자만 랜딩·캐러셀 결과를 `PAUSED` 캠페인·광고 세트·크리에이티브·광고 초안으로 만들고, 활성화와 지출은 구조적으로 막는다.
- 변경: Graph v26 server-only provider, App Secret Proof, Page·Instagram exact binding attestation, 서버 고정 계정·예산·일정·KR 타기팅, PNG 검증, 운영자 UUID allowlist, 원자 quota·lease·reconciliation ledger와 migration `202608250003`을 추가했다. UI는 회사 내부 운영자에게만 Meta 초안 생성을 노출하며 브라우저가 광고 계정·token·budget·status를 정하지 못한다. 실제 계정에는 Business Portfolio `Marketvalley`, Page `Marketvalley`, Instagram `marketvalley__`, 앱 `MarketValley Ads Publisher`, Employee System User `Marketvalley Publisher`를 연결하고 광고에 필요한 최소 자산 권한만 배정했다. App Secret Proof 요구 설정을 켜고, System User에는 앱 테스트 역할만 할당했다. `ads_management`·`ads_read`만 가진 60일 token을 발급했으며 값은 저장소·문서·채팅에 남기지 않았다.
- 검증: 기존 구현 기준 lint·typecheck·단위 테스트 31파일 158개, production build와 Chromium E2E 20개가 통과했다. 최신 `main` 인프라를 병합한 뒤 새 Supabase Turnstile 필수 계약을 Meta 테스트 fixture에 반영했고, 최종 lint·typecheck·단위 테스트 39파일 207개, configured server-secret client bundle smoke, production build와 Chromium E2E 21개가 통과했다. Meta Business Settings에서 앱 역할·Page·Instagram·광고 계정 권한과 token scope를 다시 확인했고, API용 광고 계정 ID `1026341707121609`를 내부 자산 ID와 구분했다. token·App Secret 패턴은 저장소에 기록하지 않았다.
- 전달: 구현 커밋 `7932348`을 `codex/meta-p1`에 push하고 PR `#4`를 열었다. 최초 Actions run `32856320241`은 코드 실행 전 `startup_failure`였으며, 원인은 브랜치의 이전 tag 기반 action이 저장소의 SHA pinning 정책에 걸린 것이었다. 최신 `main`의 SHA 고정 workflow와 인프라를 병합했고 Actions run `32859471623`에서 전체 quality job과 production runtime image smoke가 통과했다.
- 남은 일: 60일 token은 늦어도 2026-10-19에 회전한다. 광고 계정의 KRW·Asia/Seoul과 Page–Instagram 쌍을 운영 API에서 다시 확인한 뒤, 명시적 production 변경 승인 아래 migration 적용, Oracle secret 등록, Graph 자산 조회, `PAUSED` 단일 종단·중복 방지·0원 지출을 검증한다. App Secret, 결제수단, `ACTIVE`, 실제 광고 객체는 아직 만들지 않았다.

## 2026-08-25 — 배포 계약 CI 직렬화·provider lock 복구

- 목적: 운영 Compose 자원 상한과 OCI Terraform을 검사하는 source CI·owner-only 배포 workflow가 로컬과 Linux runner에서 같은 계약을 검증하게 한다.
- 원인: Compose JSON은 CPU를 숫자로, `mem_limit`·`memswap_limit`을 바이트 문자열로 직렬화했지만 `jq`가 메모리를 JSON 숫자와 직접 비교했다. 이를 고친 다음 run에서는 OCI provider lockfile에 macOS ARM 해시만 있어 Linux AMD64 package가 checksum 검증을 통과하지 못했다.
- 변경: 두 workflow 모두 메모리 네 필드를 `tonumber`로 정규화한 뒤 exact byte를 비교하고 같은 표현을 source·control-plane 회귀 테스트에 고정했다. OCI 8.27.0 버전은 유지하면서 `darwin_arm64`와 `linux_amd64`의 서명된 provider checksum을 lockfile에 함께 기록했다. CPU·host IP·port·protocol exact 비교는 유지했다.
- 검증: run `32857239964`에서 앱 gate 뒤 Compose 타입 실패를, run `32857963223`에서 Compose 통과 뒤 Linux provider checksum 실패를 확인했다. Compose 5.5로 같은 JSON 타입과 수정 조건을 재현했고 source focused·deploy Node 테스트, Terraform readonly init·validate가 통과했다. 배포 저장소 CI `32857894954`도 통과했다.
- 전달: source와 `ghdtjdwn/marketvalley-deploy` 수정에 포함했다. source 새 GitHub Actions run의 Terraform·image smoke 통과를 확인해야 한다.
- 남은 일: source CI 통과를 확인한다.

## 2026-08-25 — Figma 제품 메인과 생성 랜딩 레퍼런스 경계 복구

- 목적: 생성되는 랜딩의 참고 사이트 `proo-landing.vercel.app`을 Market Valley 제품 홈으로 잘못 이식한 변경을 되돌리고, 공유 Figma의 화면별 제품 플로우를 다시 기준으로 고정한다.
- 원인: 공개 산출물 `/p/[slug]`에만 적용해야 할 랜딩 레퍼런스를 제품 인터페이스 `/`의 디자인으로 해석해, Figma 메인 프로젝트 화면을 임의의 `/dashboard`로 밀어냈다.
- 변경: `/`에 Figma 기반 `전체 프로젝트` 메인을 복구하고 GNB의 프로젝트 링크, 인증 번들 검증과 E2E 진입 경로를 다시 `/`로 연결했다. `/dashboard`는 기존 주소 호환을 위해 `/`로 redirect하며, 잘못 이식한 마케팅 전용 CSS는 제거했다. `proo-landing`은 공개 랜딩 산출물 레퍼런스일 뿐 제품 UI에는 적용하지 않는다고 사용자 흐름 문서에 명시했다.
- 검증: lint, typecheck, 단위 테스트 26파일 115개, 복구 경계 focused Chromium E2E 4개와 전체 Chromium E2E 21개가 통과했다. 설정된 Supabase 환경의 production build에서 `/`의 `전체 프로젝트`·인증 초기 상태와 server-secret client bundle 비노출을 확인했다.
- 전달: 복구 커밋 `3bb6f38`을 비공개 `main`에 push했고 GitHub Actions run `32839169561`의 전체 gate가 통과했다. 뒤이어 운영·인프라 변경도 이 복구 위에 rebase해 보존했다.
- 남은 일: 없음.

## 2026-08-25 — 운영 문구 근거성·공개 예약 abuse protection 보강

- 목적: 형식만 맞는 광고 문구가 입력에 없는 운영 조건을 만들어내는 문제와 공개 예약 endpoint의 bot·폭주·capacity 경쟁 조건을 production 전에 막는다.
- 변경: 최종 prompt를 `campaign-spec-v2-reservations-flat-v9`로 강화하고 검증 중단 문장, 숫자·성과 주장, 가격·할인·환불·구체 채널, hashtag와 FAQ를 서버에서 입력 근거에 맞게 정규화하거나 fail-closed 처리한다. 운영 기본 모델은 Sonnet 4.6, temperature 0, timeout 90초, 재시도 0회로 바꿨다. Supabase 예약은 canonical HTTPS Origin과 Turnstile exact action·hostname을 확인하고, migration `202608250002`의 global→campaign 잠금 RPC가 분당·전체 capacity·중복·insert를 원자적으로 처리한다. 잘못된 UUID와 누락 token은 외부 검증 전에 400, 거절된 token은 403, verifier·DB 장애는 503, quota는 `Retry-After`가 있는 429로 구분했다. 만료된 widget은 reset하고 script 오류에는 사용자 재시도 경로를 제공한다.
- 검증: 실제 Sonnet Structured Outputs의 주입·공방 빈자리·마감 음식 대표 입력 3종이 각각 약 52.0초·55.8초·56.8초에 완료됐고 공개 금지 세부사항, hashtag, 주입 격리, 숫자 근거와 사람 판단 hook 자동 조건을 모두 통과했다. 독립 검토에서 발견한 standalone signal 재진입, 60자 hashtag 경계, Turnstile unsupported callback과 safety metadata 혼합 근거를 보완했다. 최종 `pnpm check`의 lint·typecheck·단위 테스트 34파일 164개, configured server-secret bundle, production build, Chromium E2E 21개, archive extractor 4개, coverage와 high audit가 통과했다. 커버리지는 statements 85.11%, branches 77.26%, functions 91.41%, lines 89.01%다.
- 전달: source 변경을 메인에 push하고 migration `202608250002`를 연결된 운영 Supabase에 적용했다. 원격 migration 이력 일치와 DB lint 오류 0건을 확인하고, 합성 사용자 A/B로 anon·authenticated RPC 차단, 소유자 RLS, 중복·capacity, 캠페인 8개 병렬 요청과 두 캠페인 전역 병렬 quota를 실제 검증했다. 검증 캠페인·예약·quota row·Auth 사용자는 모두 0건으로 정리했다. Anthropic 월 지출 상한 $15와 $10 알림, 자동 충전 중지도 별도 운영 설정으로 완료했다.
- 남은 일: production hostname에서 실제 Turnstile site key·secret 조합, widget 만료·재시도와 예약 종단을 확인한다.

## 2026-08-25 — 기존 Oracle VM의 Kubernetes 밖 Compose 배포 자동화

- 목적: 발표 snapshot과 분리된 메인 제품을 기존 `ssumcp`의 실제 여유 자원에서 실행하되 Kubernetes·Traefik과 runtime·port·배포 실패 범위를 분리하고, 사용자가 검토한 source Git SHA만 반복 가능하게 배포·복구한다.
- 확인: Oracle Console에서 Ubuntu 22.04 ARM64 A1 Flex 4 OCPU·24GB, private IP `10.0.0.9`와 최근 1시간 CPU 평균 9.07%·최대 9.87%, 메모리 평균 34.5%·최대 35.47%, load average 최대 0.79를 확인했다. host 80·443은 Traefik이 사용하며 기존 LB·NLB는 0개다. security list의 public 22·6443은 관리 접근 복구 뒤 축소할 위험으로 기록했다.
- 변경: 전용 사용자의 rootless Docker·cgroup v2를 강제하고 Next.js와 isolated preflight 각각 1.5 CPU·2GiB, Caddy 0.25 CPU·256MiB, BuildKit 1 CPU·3GiB와 user aggregate 2.25 CPU·6GiB 상한을 적용했다. Caddy는 사설 13080·13443만 bind한다. OCI Terraform은 public NLB·NSG와 함께 rootless Docker·release·cache를 Kubernetes boot disk와 격리하는 `prevent_destroy` 적용 50GiB Block Volume을 기존 VM에 연결한다. 팀 source CI에서는 production job·secret을 제거하고 개인 owner-only 비공개 `ghdtjdwn/marketvalley-deploy`가 수동 승인 SHA의 main ancestry와 exact `CI / quality`를 검증하도록 분리했다. `validate → revalidate → deploy` job을 분리해 source token과 SSH secret의 수명을 겹치지 않게 했고, 강제 명령 SSH gateway는 최대 256MiB archive와 `current`·`deploy`·`rollback`만 허용한다. bounded streaming extractor, release 내부 integrity manifest의 원자 이동, lost ACK lock wait와 idempotent rollback을 추가했다.
- 검증: shell·Python·Node 구문, YAML parse, Terraform 1.15.9·OCI provider 8.27.0 validation, archive traversal·symlink·duplicate·limit·PAX 거절 4개, 배포 control-plane Node 테스트 4개와 main trust boundary를 통과했다. 메인 전체 gate는 lint·typecheck·단위 테스트 164개, configured bundle, production build, Chromium E2E 21개, coverage와 high audit가 통과했다. 독립 보안 재검토에서 P0·P1 잔여가 없었고 GitHub Actions run `32856635189`에서 Caddy·Compose·컨테이너 smoke까지 통과했다.
- 전달: 비공개 `https://github.com/ghdtjdwn/marketvalley-deploy`를 사용자 개인 계정에 collaborator 없이 생성하고 GitHub Actions를 allowlist·SHA pin으로 제한했다. `unithon26/marketvalley` 한 저장소의 Contents·Actions read만 가진 30일 fine-grained token을 값 노출 없이 `SOURCE_REPOSITORY_TOKEN`에 등록했다. control plane commit `3209a95`를 push했고 CI가 통과했다. source 구현·문서는 이 작업 단위의 메인 커밋에 포함했다. Oracle VM·NLB·NSG·Block Volume·DNS는 아직 변경하지 않았다. 기존 관리자 private SSH key가 없어 serial console 복구 전까지 서버 bootstrap은 차단됐다.
- 남은 일: maintenance reboot·serial console로 접근을 복구한 뒤 rootless bootstrap, NLB·NSG·DNS, server secret, production OAuth·Turnstile, 실제 종단과 rollback rehearsal을 완료한다. Meta 자동화는 제외한다.

## 2026-08-25 — 발표 전용 clone-and-run 저장소 동결

- 목적: 친구의 발표 완성본을 이후 운영·인프라 변경과 분리하고, 새 노트북에서도 외부 계정이나 자격증명 없이 즉시 실행할 수 있게 한다.
- 변경: 메인 `b02b7bb`의 추적 파일만 새 이력으로 가져와 비공개 `unithon26/marketvalley-presentation`을 만들었다. `pnpm demo`가 inherited shell·`.env` 값과 무관하게 fixture generator·repository를 강제하고 Anthropic·Supabase·HMAC secret을 비우며, build·서버 준비 대기·포트 충돌 진단을 한 명령으로 처리한다. 발표 CI는 fixture 전용 전체 gate만 수행하고 배포하지 않는다. snapshot provenance와 운영 코드 자동 동기화 금지는 `SNAPSHOT.md`에 고정했다.
- 검증: 발표 저장소의 lint·typecheck·단위 테스트 26파일 115개, server-secret bundle smoke, production build, Chromium E2E 21개가 통과했다. 오염된 외부 환경변수를 주입한 실행과 새 remote clone에서 install·demo를 다시 수행했고 `/`, `/new`, `/campaigns/demo`, `/p/demo` 200 응답과 실제 fixture 생성 결과 이동을 확인했다. 새 이력은 사용자 신원 단일 commit이고 추적 환경 파일은 `.env.example` 하나뿐이며 secret sentinel 외 실제 자격증명은 발견되지 않았다. GitHub Actions run `32835334248`도 통과했다.
- 전달: commit `a4764b0`, tag·release `presentation-2026-08-25`를 `https://github.com/unithon26/marketvalley-presentation`에 push했다.
- 남은 일: 발표 직전에는 이 tag를 그대로 사용한다. 이후 운영 변경은 발표 저장소에 자동 반영하지 않고 실제 발표에 필요한 검증된 수정만 별도 snapshot으로 선별한다.

## 2026-08-25 — 랜딩 주장 경계와 발표 표지 자산 권리 정리

- 목적: 새 서비스 랜딩의 미측정 성과 주장을 제거하고 출처·인물 동의가 확인되지 않은 두 표지 사진을 공개 발표 가능한 원본 자산으로 교체한다.
- 변경: 랜딩 카운터를 실제 제품이 제거하는 수작업 단계의 설명으로 바꾸고 client bundle secret sentinel과 새 `/dashboard` E2E 경로를 보강했다. 표지 32·34는 사람이 없고 텍스트·로고가 없는 직접 생성 still-life 이미지로 교체해 renderer와 cover crop을 유지했다. 파일 provenance, 생성 prompt, 금지 요소와 사용 범위를 `docs/asset-provenance.md`에 기록하고 기존 권리 불명 사진은 Git에서 제거했다.
- 검증: 실제 렌더링한 세로·가로 표지를 시각 대조했고 focused cover E2E와 최종 전체 품질 gate가 통과했다. 커밋 전 자격증명·환경 파일과 변경 범위를 검사했다.
- 전달: 커밋 `285d377`, `b02b7bb`을 비공개 `main`에 push했다. GitHub Actions run `32834553433`에서 단위 테스트 115개, bundle smoke, production build와 Chromium E2E 21개가 통과했다.
- 남은 일: 없음.

## 2026-08-25 — Anthropic 운영 지출 상한 설정

- 목적: 실제 Claude 문구 생성 검증과 향후 production 호출이 예상치 못한 비용으로 이어지지 않게 계정 수준 안전장치를 둔다.
- 변경: Anthropic Console의 월 지출 상한을 15달러로 낮추고 10달러 도달 시 모든 관리자에게 알림을 보내도록 설정했다. 자동 충전은 꺼진 상태를 유지했다.
- 검증: 저장 뒤 billing 설정 화면에서 새 월 상한과 알림 임계값이 표시되는 것을 확인했다. API key 값은 읽거나 기록하지 않았다.
- 전달: Anthropic 조직 설정에 적용했다.
- 남은 일: 상한 아래에서 대표 입력 3종의 문구 품질 eval을 수행한다.

## 2026-08-25 — 서비스 랜딩 교체 후 CI 회귀 복구

- 목적: 서비스 랜딩 교체 커밋 `9d6c4d5`의 CI에서 인증 번들 검사가 실패한 원인을 복구하고, 뒤이어 드러난 전체 E2E 경로 회귀를 정리한다.
- 원인: 프로젝트 GNB가 루트 `/`에서 `/dashboard`로 이동했지만 인증 번들 스모크는 계속 `.next/server/app/index.html`을 검사했다. 전체 E2E에도 루트를 프로젝트 화면으로 가정한 세 경로가 남아 있었고, Windows Clipboard API의 CRLF 정규화가 복사 문자열 비교를 운영체제별로 다르게 만들었다.
- 변경: 인증 GNB 스모크 대상을 정적 `/dashboard` 산출물로 바꾸고, 프로젝트 이탈·전체 fixture 흐름·375px 필터 E2E를 `/dashboard` 기준으로 갱신했다. 클립보드 검증은 CRLF를 LF로 정규화해 실제 복사 내용만 비교한다.
- 검증: 설정된 Supabase 환경의 production build와 인증 초기 상태·server-secret client bundle smoke, lint, typecheck, 단위 테스트 26파일 115개, focused Chromium E2E 3개와 전체 Chromium E2E 21개가 통과했다.
- 전달: 복구 커밋 `2d61b00`을 비공개 `main`에 push했다. GitHub Actions run `32833240053`에서 install·lint·typecheck·단위 테스트 115개·인증/서버 비밀 번들 smoke·production build·Chromium E2E 21개가 모두 통과했다.
- 남은 일: 없음.

## 2026-08-25 — 실제 생성 경계와 진행 화면 연결

- 목적: 두 입력을 제출한 사용자가 입력 화면에서 AI 응답을 기다리지 않고 즉시 진행 화면을 보며, 구현된 작업의 실제 완료 뒤에만 다음 단계로 이동하게 한다.
- 변경: `/new` 제출 직후 입력 UI를 4단계 진행 UI로 교체했다. 미구현 시장 조사 준비만 연결 전임을 밝히고 2초 뒤 통과하며, AI 문구 생성은 실제 `/api/generate`, 광고 구성은 실제 `/api/campaigns` 응답까지 머문다. 게시 완료 뒤 결과 도착을 표시하고 `/campaigns/[id]` 리포트로 자동 이동한다. 실패하면 작성값과 같은 draft의 생성 결과를 보존해 재시도한다. 이탈 시 2초 대기와 브라우저 요청을 취소하고 생성 취소 신호를 서버 Route와 Anthropic SDK까지 전달한다. 예약 추이 시간·Windows 줄바꿈 보완 커밋 `f77e0b1`도 fast-forward로 반영했다.
- 검증: 실제 generate·publish 응답을 각각 보류한 단계 대기, 시장 준비 중 이탈, AI 실패 입력 보존·재시도, 게시 응답 유실 멱등 재시도 focused Chromium E2E 4개가 통과했다. 최종 `pnpm check`의 lint·typecheck·단위 테스트 26파일 115개, configured server-secret bundle smoke, production build, Chromium E2E 20개, coverage와 독립 재검토가 통과했다. 커버리지는 statements 83.58%, branches 76.19%, functions 90.13%, lines 87.93%다.
- 전달: 기능 커밋 `edbb9c4`를 비공개 `main`에 push했다. GitHub Actions run `32826662309`에서 install·lint·typecheck·단위 테스트 115개·server-secret bundle·production build·Chromium E2E 20개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 없음.

## 2026-08-25 — Anthropic 503 후속 회귀 복구

- 목적: 첫 503 수정과 CI 통과 뒤 사용자가 같은 `/api/generate` 503을 다시 확인한 문제를 최종 push 코드로 재현하고 복구한다.
- 원인: 실제 성공을 확인한 5,600바이트·42속성 평면 스키마 뒤 독립 리뷰에서 signal label 배열을 세 문자열 필드로 펼쳤고, 이 변경이 최종 스키마를 7,425바이트·44속성으로 다시 키워 Anthropic 문법 컴파일 제한을 넘었다. CI는 실제 유료 Anthropic 요청을 실행하지 않아 회귀를 발견하지 못했다.
- 변경: signal label을 positive·neutral·negative 순서가 명시된 단일 배열로 되돌리고 prompt version을 `campaign-spec-v2-reservations-flat-v2`로 올렸다. 스키마 top-level 속성·중첩 객체·직렬화 크기 회귀 검사를 추가하고, Anthropic 문법 컴파일 오류를 일반 생성 실패가 아닌 `campaign_generation_schema_error`로 안전하게 구분했다. 상세 원인과 회귀 방지는 `TROUBLESHOOTING.md`에 반영했다.
- 검증: focused 생성·prompt·route 테스트 3파일 18개, typecheck와 대상 lint가 통과했다. 최종 스키마는 5,600바이트·42속성·3객체이며 사용자가 실패한 마감한입 입력의 실제 Claude Haiku 4.5 호출이 약 31.0초에 성공해 `CampaignSpec v2`, hook 3개와 positive·neutral·negative option ID를 반환했다. 최종 `pnpm check`의 lint·typecheck·단위 테스트 26파일 114개, production build, configured server-secret client bundle smoke, Chromium E2E 17개, coverage, high audit, peer·diff 검사가 통과했다. 커버리지는 statements 83.58%, branches 76.19%, functions 90.13%, lines 87.93%다.
- 전달: 복구 커밋 `a84db62`를 비공개 `main`에 push했고 GitHub Actions run `32823730077`에서 install·lint·typecheck·단위 테스트 114개·server-secret bundle·production build·Chromium E2E 17개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 사용자가 로그인된 화면에서 같은 입력을 직접 재시도한다.

## 2026-08-25 — 광고 입력 단계의 브라우저 뒤로가기 복구

- 목적: `/new`의 2단계 솔루션 입력에서 브라우저 뒤로가기를 누르면 1단계가 아니라 메인 화면으로 이탈하는 문제를 해결한다.
- 변경: 1단계에서 2단계로 이동할 때 Next.js history state를 보존한 동일 URL entry를 추가하고 `popstate`로 입력 단계를 복원한다. 브라우저 뒤로·앞으로와 화면의 `이전` 버튼이 같은 history를 사용하며, 배경과 솔루션 입력값은 컴포넌트 상태에 그대로 남는다.
- 검증: history state 단위 테스트 2개와 focused production E2E가 통과했고, 실제 로컬 Chrome에서 2단계 → 뒤로가기 → 입력값이 남은 1단계 → 앞으로가기 → 입력값이 남은 2단계를 확인했다. 최종 `pnpm check`의 lint·typecheck·단위 테스트 26파일 114개, configured server-secret bundle smoke, production Chromium E2E 17개, coverage, high audit, peer·diff 검사가 통과했다. 커버리지는 statements 83.58%, branches 76.19%, functions 90.13%, lines 87.93%다.
- 전달: 기능 커밋 `43bc009`을 비공개 `main`에 push했다. GitHub Actions run `32823250753`에서 install·lint·typecheck·단위 테스트 114개·server-secret bundle·production build·Chromium E2E 17개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 없음.

## 2026-08-25 — 광고 진입 로그인 모달과 fixture 인증 분리

- 목적: 광고 생성을 시작할 때 별도 페이지로 맥락을 잃지 않고 Figma 로그인 카드를 보여주되 직접 `/new` 접근의 서버 인증 경계를 유지한다.
- 변경: Next.js parallel·intercepting route로 `/login?next=/new` soft navigation을 현재 화면 위 모달로 렌더링하고, 직접 접근·새로고침은 기존 전용 로그인 화면을 유지했다. 홈·GNB·리포트의 광고 생성 진입을 공용 세션 확인 링크로 통합하고 공용 로그인 카드와 닫기·Escape 동작을 적용했다. Supabase 미설정 fixture에서는 session API를 호출하지 않고 기존 `/new` 경로를 유지해 불필요한 503을 제거했다. 선택과 권한 경계는 ADR-0018과 인증 문서에 반영했다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 25파일 112개, production build, configured server-secret client bundle smoke, Chromium E2E 16개, coverage, high audit, peer·diff 검사가 통과했다. fixture 종단에서 session API 503이 runtime 오류로 남는 회귀를 재현한 뒤 설정 없는 진입에서 인증 요청 자체를 생략해 같은 종단 테스트 통과를 확인했다.
- 전달: 기능 커밋 `14e238e`를 비공개 `main`에 push했고 GitHub Actions run `32822709767`에서 install·lint·typecheck·단위 테스트 112개·server-secret bundle·production build·Chromium E2E 16개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 없음.

## 2026-08-25 — Anthropic 문구 생성 503 복구

- 목적: 로그인 뒤 `/api/generate`가 503을 반환해 실제 AI 광고 생성이 중단되는 문제를 재현하고 복구한다.
- 원인: 전체 `CampaignSpec` 71개 속성과 19개 중첩 객체를 Anthropic Structured Outputs에 전달해 내부 문법 복잡도 제한을 넘었다. 스키마를 줄인 뒤에는 정상 생성 약 29초보다 짧은 20초 timeout도 확인됐다.
- 변경: AI 소유 문구와 allowlist 선택만 담는 평면 출력 계약으로 줄이고 서버가 generation·판단 기준·Figma 필드를 조립한 뒤 최종 `CampaignSpec`을 재검증하게 했다. timeout은 60초, SDK·앱 자동 재시도는 0회로 바꿔 정상 지연을 허용하면서 timeout·빈 응답 뒤 중복 유료 요청 가능성을 줄였다. 원인·대안·회귀 방지는 `TROUBLESHOOTING.md`와 ADR-0017에 기록했다.
- 검증: 첫 평면 배열 스키마 5,600바이트·42개 속성·3개 객체에서 실제 Claude Haiku 4.5 호출이 약 28.8초에 성공해 최종 `CampaignSpec v2`, hook 3개, 문제 카드 3개, visual prompt 5개가 Zod 검증을 통과했다. 이후 리뷰 변경 뒤 실제 호출 검증 없이 `pnpm check`의 lint·typecheck·단위 테스트 24파일 108개, production build, configured server-secret bundle smoke, production Chromium E2E 16개, coverage, high audit와 peer 검사가 통과했다. 이 검증 공백으로 생긴 후속 회귀와 최종 복구는 위 작업 기록에 정정했다.
- 전달: 수정 커밋 `03705a4`를 비공개 `main`에 push했다. GitHub Actions run `32821756306`에서 install·lint·typecheck·단위 테스트 108개·server-secret bundle·production build·Chromium E2E 16개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 대표 입력 3종 품질 eval, Anthropic Console spend limit, Vercel 실제 route 지연 검증을 수행한다.

## 2026-08-25 — 최신 Figma 로고·로그인 진입·리포트 상태 반영

- 목적: 디자이너의 최신 Figma를 제품 전체와 다시 대조하고, 기능 시작 전에 로그인시키는 흐름과 확정 로고를 실제 화면에 반영한다.
- 변경: Figma의 `market V alley` 벡터 로고를 공통 브랜드 자산으로 적용했다. Supabase가 설정된 제품 환경에서 비로그인 `/new` 접근을 전용 `/login?next=/new`로 보내고 Google OAuth 뒤 원래 화면으로 복귀시킨다. 인증 취소·설정 오류·세션 장애·로그아웃 실패도 같은 화면에서 복구하며 외부 `next`와 요청 Host는 신뢰하지 않는다. 리포트의 임의 노출·CTR·업계 평균·체류 지표를 없애고 실제 예약자 수, 판단 기준, 예약 시각 기반 누적 추이와 `계측 연결 전` 상태만 표시한다.
- 안전: 홈과 공개 랜딩은 익명 접근을 유지하고, Supabase 미설정 fixture 발표 경로는 외부 인증 없이 동작한다. Supabase/JWKS 일시 장애는 로그아웃으로 오인하지 않으며, 로그아웃 실패 시 현재 화면 복귀 경로를 보존한다.
- 결정: 홈 CTA에만 모달을 붙이지 않고 직접 URL 접근까지 보호하는 서버 진입 gate와 전용 로그인 route를 선택했다. 선택과 기각 대안은 ADR-0018에 기록했다.
- 검증: 최신 Figma와 데스크톱·375px 화면을 직접 대조했고 모바일 가로 overflow가 없음을 확인했다. 독립 재검토의 복귀 경로와 세션 장애 구분 지적을 보완했다. 최종 `pnpm check`의 lint·typecheck·단위 테스트 24파일 107개, production build, configured server-secret bundle smoke, production Chromium E2E 16개, coverage, high audit, peer·diff 검사가 통과했다. 커버리지는 statements 82.72%, branches 74.57%, functions 86.75%, lines 87.36%다.
- 전달: 통합 기능 커밋 `6cd0b07`과 인증 복귀·장애 경계 보완 커밋 `475aa59`를 비공개 `main`에 push했다. GitHub Actions run `32818832890`에서 install·lint·typecheck·단위 테스트 107개·server-secret bundle·production build·Chromium E2E 16개가 모두 통과했다. 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 디자이너의 최종 GNB·진행 상태 그래픽을 받으면 현재 fallback을 교체한다. 표지 `32`·`34` 사진의 사용권과 인물 동의도 공개 제출 전에 확인한다.

## 2026-08-25 — Supabase 영속 저장·소유권 RLS와 분산 생성 quota 구현

- 목적: 서버 메모리 repository를 실제 다중 기기 저장소로 교체하고, 광고·예약자 원문 소유권과 유료 AI 비용 한도를 DB에서 강제한다.
- 변경: `campaigns`, `campaign_reservations`, 사용자 분당·일일·전체 일일 생성 quota 테이블과 migration을 추가했다. `auth.uid() = owner_id` operation별 RLS, server-only secret client, 요청별 사용자 session repository, HMAC 이메일 중복 방지, 동의 버전·시각, 원자 live reset RPC와 원자 quota RPC를 구현했다. `CAMPAIGN_REPOSITORY_MODE=fixture|supabase`를 명시적으로 분리하고 production 유료 생성은 Supabase 분산 제한 없이 실행되지 않게 했다. 작업 중 원격에 추가된 OpenAI preview는 현재 Anthropic 단일 공급자 결정에 맞춰 `preview:anthropic`으로 보존 이식했다.
- 안전: service key는 공개 snapshot 조회·검증된 예약 저장·quota RPC에만 사용하고 소유자 작업에는 사용하지 않는다. `anon`의 테이블 권한과 quota RPC 실행 권한을 회수했으며 공개 예약 응답에서 예약자 수·목록을 제거했다. JSON·same-origin 예약 경계와 server secret client bundle 검사를 추가했다.
- 결정: service-role 단일 repository 계획을 기각하고 사용자 JWT가 적용된 client와 DB RLS를 함께 사용한다. 선택과 기각 대안은 ADR-0016에 기록했다.
- 실패와 해결: E2E에서 내부 `request.url`의 `localhost`와 실제 `Host/Origin`의 `127.0.0.1` 차이를 교차 출처로 오판해 예약 4개 시나리오가 실패했다. 실제 Host·forwarded authority 기준으로 수정하고 `TROUBLESHOOTING.md`에 재현·원인·회귀 방지를 기록했다. 다른 로컬 서버가 기본 E2E 포트를 점유한 경우를 위해 포트를 환경변수로 분리했고, clipboard 권한도 고정 포트가 아닌 실제 페이지 origin을 사용하게 했다.
- 검증: 코드 단계에서는 focused Supabase·route 보안 테스트, `pnpm check`의 lint·typecheck·단위 테스트 24파일 106개, production build, server-secret bundle smoke, Chromium E2E 16개, coverage·high audit·peer·diff 검사가 통과했다. 운영 단계에서는 `supabase db lint --linked` 오류 0건과 migration up-to-date를 확인했다. 합성 사용자 A/B로 직접 RLS, anon 차단, 예약 원문 격리, HMAC 중복, reset, service-only quota를 검증하고 실제 repository adapter와 Supabase 모드 production Route Handler의 생성·게시·공개 조회·예약·리포트·판단·초기화·삭제까지 통과했다. 검증 뒤 5개 테이블과 합성 Auth 사용자가 모두 0건임을 확인했다.
- 전달: 기능 커밋 `6cd0b07`과 GitHub Actions run `32818491564` 통과 뒤, 2026-08-25 사용자의 운영 변경 승인에 따라 migration `202608250001`을 연결된 운영 Supabase 프로젝트에 적용했다. 운영 기록 커밋 `bf827bd`를 비공개 `main`에 push했고 GitHub Actions run `32820632053`의 전체 gate가 통과했다. 서버 키와 검증용 HMAC은 프로세스 메모리에서만 사용하고 파일·Git에는 남기지 않았다.
- 남은 일: Supabase DB 작업은 없다. 현재 인증된 Vercel 계정에는 연결할 프로젝트가 없으므로 배포 환경의 `CAMPAIGN_REPOSITORY_MODE=supabase`, server key와 고정 `SIGNAL_HASH_SECRET` 등록은 실제 배포 프로젝트 생성·연결 시 수행한다. production OAuth·Anthropic spend limit은 별도 배포 운영 범위다.

## 2026-08-25 — 문구 생성 공급자를 Anthropic으로 교체

- 목적: OpenAI를 사용하지 않고 제품의 모든 live 문구 생성을 Anthropic의 최저가 활성 Claude 모델로 통일한다.
- 변경: OpenAI SDK·adapter·생성 모드·환경변수·오류 코드를 제거하고 `AnthropicCampaignGenerator`, Messages API Structured Outputs와 `claude-haiku-4-5-20251001`을 제품 기본 경로로 연결했다. 로컬 비밀 환경은 `ANTHROPIC_API_KEY`로 전환하고 fixture fallback, Google 로그인, same-origin, 분산 quota와 서버 소유 필드 덮어쓰기는 유지했다. 결정과 기각 대안은 ADR-0017에 기록했다.
- 검증: Anthropic API에 실제 Structured Outputs 요청을 보내 `Claude Haiku 4.5` 응답을 확인했다. focused 단위 테스트 3파일 17개, `pnpm check`의 lint·typecheck·단위 테스트 99개, configured production build와 server-secret client bundle smoke, production Chromium E2E 16개가 통과했다. 실행 코드·테스트·환경변수 예시에서 OpenAI 참조가 없음을 검색했다.
- 전달: 로컬 구현과 검증까지 완료했다. 작업 트리에 Supabase·인증 관련 진행 중 변경이 함께 있어 이 작업에서는 commit·push·배포를 수행하지 않았다.
- 남은 일: 대표 제품 입력으로 Claude 문구 품질 eval을 수행하고 Anthropic Console의 spend limit을 설정한다. 배포 전 운영 Supabase migration과 production 환경변수·OAuth 검증도 완료해야 한다.

## 2026-08-25 — 랜딩 AI 문구 생성 기본 경로 전환

- 목적: 구현돼 있던 OpenAI 문구 생성 adapter가 fixture 기본 설정 때문에 실제 랜딩 제작에 사용되지 않던 불일치를 해소한다.
- 변경: 제품 기본 생성 모드를 `openai`로 전환하고 랜딩 Hero·문제·혜택·단계·FAQ를 포함한 단일 Structured Outputs 결과가 기존 `CampaignSpec`·renderer로 이어지는 계약을 고정했다. `/new`는 요청 시점의 모드와 키 준비 상태를 표시하며 fixture fallback을 AI 결과로 표현하지 않는다.
- 안전: OpenAI 모드의 `/api/generate`는 JSON Content-Type, same-origin, Google `getClaims()` 로그인, 사용자별 단일 프로세스 분당 3회 제한을 모델 호출 전에 적용한다. 노출 이력 있는 로컬 키는 `.env.local`의 빈 값으로 덮어써 실제 호출과 과금을 막았다.
- 결정: 제품은 OpenAI를 기본으로 사용하고 자동 테스트와 비상 발표만 fixture를 명시한다. 선택과 기각 대안은 ADR-0015에 기록했다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 79개, build/start 생성 모드를 다르게 둔 production E2E 15개, configured production build와 server-secret client bundle smoke, coverage, high audit, peer·diff 검사가 통과했다. 독립 리뷰의 공개 유료 endpoint와 정적 환경 상태 지적을 수정하고 재검토했다.
- 전달: 기능 커밋 `d18d193`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32814869482`에서 install·lint·typecheck·단위 테스트 79개·configured auth/server-secret bundle·production build·Chromium E2E 15개가 모두 통과했다. 실제 OpenAI 요청·과금, 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 회전된 키와 비용 승인 아래 대표 입력 품질 eval을 수행한다. Vercel OpenAI 활성화 전 Supabase 기반 분산 rate limit과 일·월 총예산 차단 또는 OpenAI 프로젝트 예산 상한을 적용한다.

## 2026-08-25 — 로컬 OAuth origin 불일치 복구

- 목적: `127.0.0.1`에서 시작한 Google 로그인이 `localhost` callback에서 실패하는 문제를 재현하고 복구한다.
- 변경: OAuth 시작 요청의 origin이 `NEXT_PUBLIC_SITE_URL`과 다르면 Supabase 호출과 PKCE 쿠키 생성 전에 query를 보존한 canonical `/auth/google`로 이동한다. 인증 운영 문서와 troubleshooting 기록, host 불일치 단위 회귀 테스트를 추가했다.
- 원인: `127.0.0.1`과 `localhost`는 같은 로컬 서버에 닿지만 host-only PKCE cookie를 공유하지 않는다. 시작 host와 callback host가 달라 verifier가 callback에 전달되지 않았다.
- 검증: 인증 focused 테스트 3파일 20개, `pnpm check`의 lint·typecheck·단위 테스트 73개, configured auth/server-secret bundle smoke, production Chromium E2E 14개, coverage, high audit, peer·diff 검사가 통과했다. 커버리지는 statements 79.53%, branches 73.5%, functions 84.21%, lines 82.63%다. 실제 Chrome에서 `127.0.0.1`로 시작해 `localhost` canonical 이동, Google 계정 선택, Supabase callback, 로그인 사용자 표시까지 확인했다.
- 전달: 사용자 Git/GitHub 신원·원격 최신성·staged 비밀정보를 확인한 뒤 수정 커밋 `eb0cd38`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32813998399`에서 install·lint·typecheck·단위 테스트 73개·configured auth bundle smoke·production build·Chromium E2E 14개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.

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

## 2026-08-25 — 무과금 개발 모드와 OpenAI 문구 생성 adapter 준비

- 목적: 개발·발표 중 모델 과금을 없애면서, 사용자 입력에서 랜딩·캐러셀·게시 문구를 생성하는 OpenAI 경로를 실제 적용 직전 상태까지 준비한다.
- 변경: `CAMPAIGN_GENERATOR_MODE`를 추가해 API 키가 있어도 기본 `fixture`만 선택하도록 고정했다. 비활성 `OpenAICampaignGenerator`는 Responses API Structured Outputs 한 번으로 슬롯별 prompt를 실행하고, OpenAI 전용 배열 schema를 최종 `CampaignSpec`으로 재검증한다. 생성 메타데이터, legacy 판단·option 필드와 Figma 색상·시각 방향은 서버 값으로 덮어쓰며 timeout, 제한된 재시도, `store: false`, 비밀정보 없는 503을 적용했다. 작업 중 먼저 올라온 예약자명단 계약·화면 커밋 `cdfd232`를 병합하고 prompt version을 `campaign-spec-v2-reservations`로 올려 동의·수집 목적·구매 비보장 문구를 고정했으며 reference fixture와 입력 개인화 문구도 같은 계약으로 맞췄다. production E2E와 bundle smoke는 fixture를 강제하고 서버 키의 client bundle 비노출을 검사한다.
- 결정: OpenAI API에는 무료 문구 생성 모델이 없으므로 개발·테스트·발표는 외부 호출 0회의 fixture를 사용한다. live 후보만 비용이 낮고 Structured Outputs를 지원하는 `gpt-4o-mini`로 바꾸며, `openai` 모드를 명시적으로 켠 뒤부터 과금된다는 경계를 ADR-0014에 기록했다. 이미지 모델도 개발·발표에서 비활성화한다.
- 검증: OpenAI와 예약자명단 통합 focused 단위 테스트 33개, `pnpm check`의 lint·typecheck·단위 테스트 72개, configured production build와 server-secret client bundle smoke, production Chromium E2E 14개, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 통과했다. 커버리지는 statements 79.32%, branches 73.17%, functions 84.11%, lines 82.35%다. 실제 OpenAI API 요청은 수행하지 않아 호출과 과금은 0회다.
- 전달: OpenAI adapter 커밋 `fbdddc8`, 예약자명단 통합 `58d4dbc`, E2E 계획 통합 `d76d7c6`과 최종 동기화 `70b1c93`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. GitHub Actions run `32811937835`의 전체 gate가 통과했다. 실제 OpenAI 모드 활성화, API 요청, 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 회전한 키와 명시적 비용 승인 아래 대표 입력 3종·긴 한글·refusal 품질 eval을 통과한 뒤에만 `CAMPAIGN_GENERATOR_MODE=openai`로 전환한다. `CampaignSpec.validation.signal`은 현재 Meta·캐러셀 CTA export 호환을 위해 남아 있으므로 예약자명단 UI와 Supabase 계약이 안정된 뒤 별도 호환 migration으로 제거한다.

## 2026-08-25 — 예약자명단 전환과 OpenAI adapter 통합 및 E2E 복구

- 목적: 개발자 A가 `main`에 올린 예약자명단 계약·화면과 재작성 계획을 로컬 OpenAI adapter에 통합하고, 익명 3지선다 계약에 남아 있던 E2E를 실제 예약 흐름으로 복구한다.
- 변경: 원격 예약자명단 커밋 `cdfd232`와 계획 `e7d265c`를 각각 병합했다. `app/api/_lib/http.ts` 충돌은 삭제된 `InvalidSignalOptionError`만 제거하고 OpenAI 설정·생성 503 경계는 유지했다. 이름·이메일·동의를 필수로 받는 계약에 prompt·reference fixture·예시 입력을 맞추고, 예전 익명·개인정보 미수집 입력은 실제 예약 방식으로 정규화한다. E2E helper·API·종단·중복 이메일·빈 목록·375px 키보드·저장 실패·캠페인 격리·polling 시나리오를 `/api/reservations`와 예약자명단 리포트 기준으로 갱신했다. API cache 검증은 Next.js가 추가하는 private 지시를 허용하면서 `no-store`를 반드시 요구한다.
- 실패와 해결: route rename 뒤 실행 중이던 Next.js가 남긴 `.next/dev/types`가 삭제된 `/api/signals`를 참조해 typecheck가 실패했다. 생성 캐시를 작업 공간 밖 임시 백업으로 옮긴 뒤 `next typegen`으로 다시 생성했다. 첫 E2E는 옛 신호 assertion 6건과 종료 연쇄 실패가 났고, 예약 폼·리포트 계약으로 재작성한 뒤 14개가 통과했다.
- 영향 범위: 예약자명단·OpenAI 문구와 fixture, 제품·아키텍처 문서, `tests/e2e/demo-flow.spec.ts`, 단위 테스트와 팀 작업 기록
- 검증: focused 단위 테스트 5파일 33개, 최종 개인정보 계약 보정 focused 단위 테스트 3파일 24개, `pnpm check`의 lint·typecheck·단위 테스트 14파일 72개, configured production auth/server-secret bundle smoke, production Chromium E2E 14개, coverage, high audit, peer dependency, diff 검사가 모두 통과했다. 커버리지는 statements 79.32%, branches 73.17%, functions 84.11%, lines 82.35%다.
- 전달: 최종 동기화 `70b1c93`, 전달 기록 `5cc3449`, 예약 문구 계약 보정 `a086b4d`까지 비공개 `unithon26/marketvalley`의 `main`에 push했다. 최종 GitHub Actions run `32812242438`에서 install·lint·typecheck·단위 테스트 72개·configured auth bundle smoke·production build·Chromium E2E 14개가 모두 통과했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: G3 Supabase migration·RLS·repository에서 예약 원문을 광고 소유자에게만 반환하고 production OAuth 소유권을 연결한다. 공개 배포 전 사진 사용권과 실제 production URL 설정도 확인한다.

## 2026-08-25 — 리포트 카드뉴스 디자인 이미지 슬롯 준비

- 목적: 마지막 데모 리포트의 캐러셀 ZIP 다운로드를 유지하면서, 디자이너가 최종 이미지를 교체할 수 있는 영역을 바로 아래에 준비한다.
- 변경: Instagram 캐러셀 결과물 안에 16:9 반응형 이미지 슬롯과 임시 SVG를 추가했다. ZIP 버튼의 이름·동작·파일 구성은 유지하고, E2E에서 이미지 슬롯이 버튼 아래에 보이는지 함께 검증한다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 14파일 74개, focused production Chromium E2E 1개, 전체 production Chromium E2E 14개가 통과했다. 로컬 브라우저에서 데스크톱과 375px 모두 이미지 로드와 가로 overflow 0을 확인했다.
- 전달: 기능 커밋 `dbab413`을 비공개 `unithon26/marketvalley`의 `main`에 push했다. 제품 배포와 행사 제출은 수행하지 않았다.
- 남은 일: 디자이너 확정본을 받으면 `public/report/carousel-preview-placeholder.svg`를 최종 자산으로 교체하고 공개 전 사용권을 확인한다.

## 2026-08-25 — 리포트 카드뉴스 실제 미리보기 연결

- 목적: 마지막 리포트의 임시 디자인 슬롯을 없애고, 생성된 Instagram 카드뉴스 5장을 결과 화면에서 바로 확인할 수 있게 한다.
- 변경: ZIP 생성에 쓰는 동일한 `CarouselCard` 렌더러를 반응형 SVG 미리보기에 재사용했다. 데스크톱은 5장을 한 줄에 배치하고, 모바일은 4:5 비율을 유지한 가로 스크롤·스냅 갤러리로 전환한다. 각 카드에 역할과 PNG 파일명을 표시하고 화면 미리보기와 다운로드 결과가 같은 디자인임을 안내한다.
- 검증: `pnpm check`의 lint·typecheck·단위 테스트 26파일 115개, configured server-secret client bundle smoke, production Chromium E2E 20개, coverage, high audit, peer dependency, diff 검사가 모두 통과했다. 커버리지는 statements 83.58%, branches 76.19%, functions 90.13%, lines 87.93%다. 로컬 브라우저에서 실제 카드 5장, 4:5 비율, 모바일 230px 카드 스크롤과 첫 장·마지막 장 표시를 직접 확인했다.
- 전달: 기능 변경과 작업 기록을 비공개 `unithon26/marketvalley`의 `main`에 전달한다. 제품 배포와 행사 제출은 수행하지 않는다.
- 남은 일: 이 작업 범위의 제품 변경은 없다. 표지 `32`·`34`를 실제 사용한다면 기존 사진 사용권 확인은 계속 필요하다.

## 2026-08-25 — 서비스 랜딩 CI 복구와 공개 주장 경계 보정

- 목적: 개발자 A가 교체한 서비스 랜딩을 기존 인증·배포 안전성 검사와 통합하고, 아직 계측하거나 제공하지 않는 성과를 공개 화면이 주장하지 않게 한다.
- 변경: 인증 GNB가 `/dashboard`로 이동한 구조에 맞춰 configured production bundle smoke의 HTML 검사 대상과 전체 E2E의 이동·진입·필터 경로를 바꿨다. 새·legacy Supabase server key 모두 client bundle 비노출 sentinel로 고정했다. 새 랜딩의 가상 노출·CTR·업계 평균·예약자 이메일, `시장성 우수`, 실제 Meta 집행·가격·효능 문구를 제거하고, 사라지는 반복 업무·동의 기반 예약자명단·`계측 연결 전`·사람의 다음 판단으로 같은 레이아웃을 채웠다. 루트 E2E에 필수 안전 문구와 허위 성과 비노출 경계를 추가했다.
- 실패와 해결: `main` push `9d6c4d5`의 GitHub Actions run `32827728636`은 이전 `/` HTML에서 인증 초기 상태를 찾다가 실패했다. 인증 검사를 삭제하지 않고 실제 경계인 `/dashboard` build artifact를 검사하도록 수정했으며 자세한 원인은 `TROUBLESHOOTING.md`에 기록했다.
- 검증: focused `pnpm test:auth-bundle`, `pnpm check`의 lint·typecheck·단위 테스트 26파일 115개, 루트 랜딩 production Chromium E2E 1개가 통과했다. 첫 전체 production E2E는 이전 route를 참조한 3개가 실패하고 18개가 통과해 테스트 경로를 보정했다. 최종 configured bundle smoke, production build, Chromium E2E 21개, coverage, high audit, peer dependency와 diff 검사가 모두 통과했다. 커버리지는 statements 83.58%, branches 76.19%, functions 90.13%, lines 87.93%다.
- 전달과 남은 일: 변경은 로컬 작업 트리에 있다. `main` push와 GitHub Actions 성공을 확인한 뒤 해당 커밋을 별도 발표 저장소의 무자격증명 fixture snapshot으로 고정한다.
