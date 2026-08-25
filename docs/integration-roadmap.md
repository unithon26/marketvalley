# 외부 연동 로드맵

Figma 기반 화면과 mock 종단 흐름, Supabase·Anthropic adapter 코드는 구현했다. 아래 순서는 운영 프로젝트에 migration과 secret을 적용하고 실제 외부 호출을 검증하기 위한 작업 기준이다.

## 1. Supabase

상태: migration, `auth.uid()` RLS, 요청별 server repository, HMAC 중복 방지와 분산 AI quota 코드는 완료했다. 운영 Supabase 프로젝트에는 아직 migration을 적용하지 않았고 live 종단 검증도 수행하지 않았다.

완료 조건:

- server-only repository가 캠페인 snapshot, 동의 기반 예약자명단과 사람의 다음 행동을 저장한다.
- 게시 후 실제 slug가 발급되고 시크릿 창이나 다른 기기에서 `/p/[slug]`를 열 수 있다.
- 같은 캠페인에 같은 이메일이 중복 예약되지 않도록 서버 HMAC email hash와 DB unique constraint로 막는다.
- 원문 이메일은 소유자 조회에만 사용하고 목록 화면에는 마스킹해 표시한다.
- service role key는 브라우저 번들, URL과 로그에 나타나지 않는다.

남은 순서:

1. 운영 프로젝트에 migration 적용 후 정책·함수 privilege 확인
2. server secret과 고정 HMAC secret을 안전한 환경변수로 등록
3. 로컬에서 `CAMPAIGN_REPOSITORY_MODE=supabase` 게시·공개 예약·리포트 종단 검증
4. 다른 계정이 소유자 route와 예약 원문을 읽지 못하는지 실제 RLS 검증
5. production URL·Vercel 환경변수와 배포 도메인의 실제 OAuth 검증

## 2. Anthropic

상태: `AnthropicCampaignGenerator`와 selector를 구현하고 `Claude Haiku 4.5` Structured Outputs 실제 연결을 확인했다. 대표 입력 문구 품질 eval은 아직 수행하지 않았다.

완료 조건:

- 서버의 Anthropic Messages API가 문법 복잡도를 제한한 평면 문구 슬롯을 Structured Outputs로 한 번에 반환하고, 서버가 최종 `CampaignSpec`으로 조립한다.
- `lib/ai/campaignPrompts.ts`의 슬롯별 지시를 하나의 developer prompt로 조합하고, 사용자 입력은 명령이 아닌 별도 JSON 자료로 전달한다.
- 모델이 고른 허용 template·tone에 서버가 Figma 색상을 매핑하고, `generation`과 고정 판단 기준을 서버 값으로 덮어쓴다.
- Anthropic Zod output format으로 평면 문구 계약을 검증하고, 서버가 기존 `CampaignSpec`으로 다시 검증한다. timeout과 빈 구조화 응답은 자동 재호출하지 않는다.
- 입력, prompt version과 실패 원인을 안전하게 구분하되 API 키나 민감 정보를 로그에 남기지 않는다.
- timeout이나 스키마 실패를 명시적 503으로 알리고, 개발·발표는 사전에 fixture 모드를 선택해 외부 실패와 과금을 제거한다.
- 실제 입력 3종과 긴 한글 문구 회귀 테스트를 통과한다.
- 후킹 3종이 반복 순간·사라지는 일·사람의 판단이라는 서로 다른 역할을 지키는 eval과 prompt injection 경계 테스트를 통과한다.

## 3. Vercel

- GitHub 저장소를 연결하고 검증용 배포부터 확인한다.
- fixture 모드에는 외부 환경변수를 등록하지 않는다.
- live 검증 환경에만 Anthropic·Supabase 값을 암호화된 환경변수로 등록한다.
- 배포 성공과 캠페인 게시 성공을 다른 상태로 표현한다.

## 4. Meta P1

P0, 발표 준비, Supabase와 Anthropic 안정화가 모두 끝난 경우에만 검토한다. 팀 소유 테스트 계정과 권한이 이미 있을 때 `PAUSED` 객체 생성까지만 허용하며 `ACTIVE` 전환과 실제 지출은 클라이언트와 서버 모두에서 막는다.

상세 보안 불변조건은 [ADR-0003](decisions/0003-stage-meta-automation-behind-human-approval.md)을 따른다.
