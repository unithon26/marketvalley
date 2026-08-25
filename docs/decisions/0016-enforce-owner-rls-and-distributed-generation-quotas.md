# ADR-0016: 광고 소유권은 RLS로, 생성 비용 제한은 원자 DB quota로 강제한다

상태: 채택

기준일: 2026-08-25

## 배경

fixture repository는 한 서버 프로세스에만 상태가 남아 다중 기기와 serverless 배포를 지원하지
못한다. 기존 B-1 계획은 모든 DB 작업에 service-role client를 쓰도록 제안했지만, 이 키는 RLS를
우회하므로 `auth.uid()` 기반 광고 소유권을 DB가 검증하지 못한다. 유료 AI 호출 제한도 프로세스
메모리에만 있어 프로세스 재시작이나 여러 서버 인스턴스에서 합산되지 않는다.

## 결정

- `campaigns.owner_id`는 `auth.uid()`를 기본값으로 저장한다. 게시·리포트·판단·초기화·삭제는
  요청의 Supabase 세션 client로 수행하고 operation별 RLS가 `owner_id = auth.uid()`를 검사한다.
- 공개 랜딩 조회와 동의가 검증된 예약 저장만 server-only secret client를 사용한다. `anon`에는
  캠페인 테이블과 예약자명단 테이블 권한을 주지 않으며, 예약자 원문은 광고 소유자만 읽는다.
- 같은 사용자의 같은 `draft_id`는 하나의 snapshot으로 멱등 처리하고, 같은 캠페인의 같은
  이메일은 서버 HMAC과 `(campaign_id, email_hash)` unique 제약으로 한 번만 저장한다.
- `CAMPAIGN_REPOSITORY_MODE` 기본값은 `fixture`다. 명시적으로 `supabase`를 선택하고 URL,
  server key, 32바이트 이상의 `SIGNAL_HASH_SECRET`이 모두 있을 때만 실제 DB를 사용한다.
- 생성 quota는 service-role만 실행 가능한 `consume_generation_quota` 함수가 한 트랜잭션에서
  분당 사용자 한도, 사용자 일일 한도, 전체 일일 한도를 잠그고 증가시킨다. production 유료 생성
  모드가 fixture 메모리 제한으로 실행되려 하면 요청을 503으로 닫는다.
- quota RPC는 `SECURITY DEFINER`가 필요하므로 빈 `search_path`와 schema-qualified relation을
  사용하고 `anon`·`authenticated`의 execute 권한을 회수한다.

## 기각한 대안

### 모든 repository 작업에 service-role 사용

구현은 단순하지만 RLS를 우회한다. 애플리케이션의 사용자 ID 비교 한 곳이 빠지면 다른 사용자의
예약자 원문과 판단을 읽거나 바꿀 수 있어 기각했다.

### 공개 사용자를 위한 캠페인·예약 테이블 정책 추가

브라우저가 Supabase Data API를 직접 호출할 수 있게 되지만, 공개 캠페인 행의 `draft_id`와
예약자 개인정보 노출 면적이 커진다. P0는 Next.js 서버 경로 하나로 입력 검증과 HMAC을 강제한다.

### 인스턴스별 메모리 rate limit 유지

로컬 fixture에는 충분하지만 serverless 인스턴스 수만큼 한도가 늘어나 비용 상한이 되지 않는다.
배포형 유료 AI 경로에는 사용할 수 없다.

## 결과

fixture 발표 경로는 로그인과 외부 DB 없이 그대로 동작한다. Supabase 모드에서는 실제 계정이
광고 소유자가 되고 공개 예약은 여러 기기에서 한 목록으로 합쳐진다. DB migration을 운영
프로젝트에 적용하고 server secret을 설정하기 전까지 live 모드는 의도적으로 활성화되지 않는다.
