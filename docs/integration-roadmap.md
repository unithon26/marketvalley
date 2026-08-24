# 외부 연동 로드맵

현재는 Figma 기반 화면과 mock 종단 흐름을 구현했고 외부 adapter는 연결하지 않았다. 아래 순서는 안정된 발표 흐름에 실제 데이터를 연결하기 위한 작업 기준이다.

## 1. Supabase

완료 조건:

- server-only repository가 캠페인 snapshot, 익명 선택형 응답, 집계와 사람의 다음 행동을 저장한다.
- 게시 후 실제 slug가 발급되고 시크릿 창이나 다른 기기에서 `/p/[slug]`를 열 수 있다.
- 같은 브라우저의 중복 응답은 익명 client id hash와 DB unique constraint로 막는다.
- 요청이 보낸 signal 분류를 신뢰하지 않고 공개 snapshot의 선택지에서 서버가 파생한다.
- service role key는 브라우저 번들, URL과 로그에 나타나지 않는다.

권장 순서:

1. migration과 RLS 정책 작성
2. server repository 단위 테스트
3. publish/read route 연결
4. signal/aggregate/next-action route 연결
5. 시크릿 창과 새로고침 수동 검증

## 2. OpenAI

완료 조건:

- 서버의 Responses API가 전체 `CampaignSpec`을 Structured Outputs로 한 번에 반환한다.
- 결과를 Zod로 다시 검증하고 스키마 오류는 한 번만 재시도한다.
- 입력, prompt version과 실패 원인을 안전하게 구분하되 API 키나 민감 정보를 로그에 남기지 않는다.
- timeout이나 스키마 실패 뒤 입력을 잃지 않고 mock 결과로 전환할 수 있다.
- 실제 입력 3종과 긴 한글 문구 회귀 테스트를 통과한다.

## 3. Vercel

- GitHub 저장소를 연결하고 검증용 배포부터 확인한다.
- mock 모드에는 외부 환경변수를 등록하지 않는다.
- live 검증 환경에만 OpenAI·Supabase 값을 암호화된 환경변수로 등록한다.
- 배포 성공과 캠페인 게시 성공을 다른 상태로 표현한다.

## 4. Meta P1

P0, 발표 준비, Supabase와 OpenAI 안정화가 모두 끝난 경우에만 검토한다. 팀 소유 테스트 계정과 권한이 이미 있을 때 `PAUSED` 객체 생성까지만 허용하며 `ACTIVE` 전환과 실제 지출은 클라이언트와 서버 모두에서 막는다.

상세 보안 불변조건은 [ADR-0003](decisions/0003-stage-meta-automation-behind-human-approval.md)을 따른다.
