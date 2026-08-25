# 외부 연동 로드맵

Figma 기반 화면과 mock 종단 흐름, Supabase·Anthropic adapter 코드는 구현했다. 아래 순서는 운영 프로젝트에 migration과 secret을 적용하고 실제 외부 호출을 검증하기 위한 작업 기준이다.

## 1. Supabase

상태: `auth.uid()` RLS, 요청별 server repository, HMAC 중복 방지와 분산 AI quota를 완료했다. 운영 Supabase 프로젝트에는 migration `202608250001`을 적용했고 합성 사용자 A/B의 RLS·예약·중복·reset·quota와 실제 adapter·production HTTP 종단을 검증한 뒤 검증 데이터를 정리했다. 공개 예약의 Turnstile, canonical origin, campaign/global 분당 quota와 campaign total capacity를 한 RPC로 처리하는 `202608250002`는 코드와 단위 계약까지 완료했으며 운영 적용·병렬 실DB 검증은 아직 하지 않았다.

완료 조건:

- server-only repository가 캠페인 snapshot, 동의 기반 예약자명단과 사람의 다음 행동을 저장한다.
- 게시 후 실제 slug가 발급되고 시크릿 창이나 다른 기기에서 `/p/[slug]`를 열 수 있다.
- 같은 캠페인에 같은 이메일이 중복 예약되지 않도록 서버 HMAC email hash와 DB unique constraint로 막는다.
- 원문 이메일은 소유자 조회에만 사용하고 목록 화면에는 마스킹해 표시한다.
- service role key는 브라우저 번들, URL과 로그에 나타나지 않는다.

남은 순서:

1. 승인 뒤 운영 Supabase에 `202608250002`를 적용하고 anon/authenticated 실행 거절, service role RPC, 병렬 quota·capacity를 실DB에서 검증
2. Oracle 서버의 권한 0600 `production.env`에 server secret, 고정 HMAC과 Turnstile key 등록
3. production HTTPS origin을 Supabase Site URL·redirect allow-list와 Turnstile hostname에 등록
4. production URL에서 실제 widget 예약·중복·만료 재시도, 게시·다른 기기 공개 예약·소유자 리포트 종단 재검증
5. production OAuth 사용자 간 소유자 route와 예약 원문 격리 재검증

## 2. Anthropic

상태: `AnthropicCampaignGenerator`와 selector를 구현했다. Haiku 4.5의 대표 입력에서 반복된 근거 없는 가격·할인·운영 조건 확장을 확인해 prompt와 서버 안전 경계를 강화했다. 기본 모델을 Sonnet 4.6으로 바꾸고 injection, 공방 빈자리, 마감 음식의 실제 Structured Outputs 대표 입력 3종이 모든 자동 품질 조건을 통과했다. 요청 timeout은 90초, 자동 재시도는 0회이며 prompt version은 `campaign-spec-v2-reservations-flat-v9`다.

완료 조건:

- 서버의 Anthropic Messages API가 문법 복잡도를 제한한 평면 문구 슬롯을 Structured Outputs로 한 번에 반환하고, 서버가 최종 `CampaignSpec`으로 조립한다.
- `lib/ai/campaignPrompts.ts`의 슬롯별 지시를 하나의 developer prompt로 조합하고, 사용자 입력은 명령이 아닌 별도 JSON 자료로 전달한다.
- 모델이 고른 허용 template·tone에 서버가 Figma 색상을 매핑하고, `generation`과 고정 판단 기준을 서버 값으로 덮어쓴다.
- Anthropic Zod output format으로 평면 문구 계약을 검증하고, 서버가 기존 `CampaignSpec`으로 다시 검증한다. timeout과 빈 구조화 응답은 자동 재호출하지 않는다.
- 입력, prompt version과 실패 원인을 안전하게 구분하되 API 키나 민감 정보를 로그에 남기지 않는다.
- timeout이나 스키마 실패를 명시적 503으로 알리고, Anthropic 문법 컴파일 실패는 `campaign_generation_schema_error`로 구분한다. 개발·발표는 사전에 fixture 모드를 선택해 외부 실패와 과금을 제거한다.
- 실제 입력 3종과 긴 한글 문구 회귀 테스트를 통과한다.
- 후킹 3종이 반복 순간·사라지는 일·사람의 판단이라는 서로 다른 역할을 지키는 eval과 prompt injection 경계 테스트를 통과한다.

## 3. Oracle production

- 기존 Oracle A1 VM의 실제 여유와 Ubuntu 22.04 ARM64, 기존 Traefik의 host 80·443 점유를 확인했다. rootless Compose·Caddy 사설 고포트, OCI NLB Terraform과 owner-only GitHub SSH release control plane을 구현했다.
- 기존 SSH key를 찾거나 승인된 maintenance reboot로 관리 접근을 복구한 뒤 `/opt/marketvalley`와 전용 rootless Docker 사용자를 초기화한다.
- server secret은 VM의 권한 0600 파일에만 두고 개인 배포 저장소에는 source read-only token과 강제 명령 SSH 자격증명만 둔다. 팀 source 저장소에는 운영 비밀이 없다.
- source `main`의 검토한 전체 SHA와 성공한 quality job을 확인한 수동 workflow만 실행한다. 격리 image health, Compose health, 공개 HTTPS health와 Git SHA가 모두 일치해야 완료한다.
- 상세 절차는 [Oracle production 배포](deployment.md)를 따른다.
- 배포 성공과 캠페인 게시 성공을 다른 상태로 표현한다.

## 4. Meta P1

사용자의 최신 범위에서 Meta 계정 연결과 광고 객체 자동화는 제외한다. 현재 구현한 PNG·문구·destination URL의 `Meta 게시 준비` ZIP까지만 유지하며 계정 권한, 결제수단, `PAUSED`·`ACTIVE` 객체에는 쓰기 작업을 하지 않는다. 향후 별도 제품 결정으로 다시 열기 전에는 production 완료 조건이나 남은 작업으로 세지 않는다.

상세 보안 불변조건은 [ADR-0003](decisions/0003-stage-meta-automation-behind-human-approval.md)을 따른다.
