# Troubleshooting

## 2026-08-25 — Anthropic 전체 스키마가 문법 복잡도 제한으로 생성 요청을 거절함

### 맥락과 기대 동작

Google 로그인과 `ANTHROPIC_API_KEY`를 연결한 로컬 제품에서 `/new` 입력을 제출하면 Claude Haiku
4.5가 한 번의 Structured Outputs 요청으로 광고 문구를 만들고, 서버가 검증한 `CampaignSpec`을
반환해야 했다.

### 실제 동작과 영향

`POST /api/generate`가 503 `campaign_generation_unavailable`을 반환해 광고 생성이 중단됐다. 인증,
same-origin, 입력 검증과 생성 quota는 통과했지만 일반 오류 경계가 upstream 원인을 숨겨 브라우저
응답만으로는 설정·결제·모델·timeout을 구분할 수 없었다. 첫 수정 뒤에도 최종 리뷰 변경을 포함한
코드에서 같은 503이 재발했다. 로컬 실제 계정 검증에서 발견됐고 배포된 서비스 영향은 없다.

### 재현과 증거

1. 로컬 환경을 `CAMPAIGN_GENERATOR_MODE=anthropic`과 Claude Haiku 4.5로 실행한다.
2. 로그인 뒤 `/new`에서 유효한 배경과 솔루션을 제출한다.
3. `/api/generate`는 503을 반환한다.
4. 같은 adapter를 비밀값 없이 직접 실행하면 Anthropic이 400 `invalid_request_error`와 함께 컴파일된
   문법이 너무 크므로 스키마를 단순화하라는 오류를 반환한다.

기존 출력 JSON Schema는 8,341바이트, 속성 71개, 중첩 객체 19개였다. 키 값, 로그인 토큰, 사용자
입력 원문과 upstream 요청 header는 기록하지 않았다.

첫 평면화는 5,600바이트, 속성 42개, 객체 3개로 줄어 실제 요청이 성공했다. 이후 signal label의
순서 의존성을 없애려 배열을 세 문자열 필드로 펼친 최종 리뷰 변경이 스키마를 7,425바이트, 속성
44개로 다시 키웠다. 이 변경 뒤에는 실제 Anthropic 요청 없이 단위 테스트·build·fixture E2E와 CI만
통과했고, 사용자의 재시도와 같은 adapter 직접 실행에서 다시 400 `invalid_request_error`가 재현됐다.

### 검토한 가설과 근본 원인

- 키 누락·형식 오류: 서버 환경에서 키 존재, 길이와 `sk-ant-` 형식만 확인해 제외했다.
- 잘못된 모델: 설정된 snapshot ID가 `claude-haiku-4-5-20251001`임을 확인해 제외했다.
- 로그인 또는 quota 실패: 해당 경계는 각각 별도 401·429·503 코드를 사용하고 실제 응답이 생성기
  오류 코드였으므로 제외했다.
- 결제 오류: 실제 upstream 상태와 유형이 400 `invalid_request_error`여서 제외했다.

전체 `CampaignSpec`에는 AI가 만들 필요가 없는 생성 메타데이터, 판단 기준, 색상, 시각 방향과 여러
단계의 중첩 객체까지 포함돼 있었다. 이를 그대로 Structured Outputs 문법으로 컴파일하면서
Anthropic의 내부 스키마 복잡도 한도를 넘은 것이 근본 원인이다. 스키마를 평면화한 뒤에는 400이
사라졌지만 기존 20초 client timeout이 실제 약 29초 생성보다 짧다는 두 번째 문제가 드러났다.

### 대안과 해결

- 자유 형식 JSON을 프롬프트로만 요청하면 문법 컴파일은 피할 수 있지만 파싱과 필드 누락을 다시
  처리해야 하므로 기각했다.
- 랜딩과 캐러셀을 여러 호출로 나누면 스키마는 작아지지만 비용·대기 시간과 채널 간 불일치가
  늘어나므로 기각했다.
- 한 번의 호출은 유지하되 AI가 소유한 문구와 허용된 template·tone만 평면 계약으로 출력하고,
  서버가 메타데이터·판단 기준·Figma 값을 조립하도록 변경했다.

최종 출력 스키마는 성공이 확인된 5,600바이트, 속성 42개, 객체 3개 계약을 사용한다. signal label은
한 배열 안에서 positive·neutral·negative 순서를 prompt와 조립 테스트로 고정해 문법 복잡도를 늘리지
않고 의미를 보존한다. 최종 결과는 기존 `CampaignSpec` Zod 계약으로 다시 검증한다. timeout은 60초,
SDK 자동 재시도는 0회로 둬 timeout 뒤 같은 유료 요청이 중복 실행될 가능성을 줄였다. 구조화 응답
자체가 비어도 자동 재호출하지 않고 실패를 명시한다.

Anthropic의 문법 컴파일 거절은 일반 upstream 실패와 분리해 내부 `anthropic_schema_error`, HTTP
`campaign_generation_schema_error`로 변환한다. 상세 upstream 문구와 비밀값은 응답에 노출하지
않으면서 다음 재현에서는 네트워크 응답만으로 같은 설정 회귀를 구분할 수 있다.

### 검증과 회귀 방지

- 평면 출력 스키마에 AI 문구 필드가 있고 서버 소유 `schemaVersion`이 없으며 top-level 속성 38개,
  중첩 객체 3개, 직렬화 크기 6,500자 미만인지 단위 테스트로 고정했다.
- signal label 배열을 positive·neutral·negative ID 순서로 조립하고 prompt가 같은 순서를 명시하는지
  검증했다.
- 서버 조립 뒤 generation, 판단 기준, signal option ID, Figma 색상과 전체 랜딩 구조가 기존
  `CampaignSpec`을 만족하는지 검증했다.
- 최종 `campaign-spec-v2-reservations-flat-v2`로 사용자가 실패한 마감한입 입력을 다시 보냈고 약
  31.0초에 `CampaignSpec v2`, hook 3개와 positive·neutral·negative option ID가 최종 검증을 통과했다.

대표 입력 3종의 문구 품질 eval과 Vercel 환경의 실제 route 지연·함수 제한 검증은 남아 있다. 외부
장애 시 fixture 성공으로 위장하지 않고 명시적 503과 발표용 사전 전환을 유지한다.

### 면접 질문과 답변 근거

- 왜 전체 DTO를 모델 출력 스키마로 쓰지 않았나? 서버 소유 필드까지 grammar에 포함해 신뢰 경계와
  복잡도만 키웠기 때문이다. AI 소유 필드만 출력하고 최종 DTO는 서버가 조립한다.
- 왜 여러 API 호출로 나누지 않았나? 한 번의 입력에서 채널 간 고객·문제·CTA 일관성을 유지하고
  비용과 대기 시간을 제한하는 것이 더 중요했기 때문이다.
- timeout을 늘리면서 재시도를 없앤 이유는 무엇인가? 실제 정상 생성이 20초보다 길었고, client
  timeout 뒤 자동 재시도는 첫 요청의 완료 여부를 알 수 없어 중복 과금 가능성이 있기 때문이다.

## 2026-08-25 — Supabase CLI dump dry-run이 임시 DB 자격증명을 출력함

### 맥락과 기대 동작

운영 migration 적용 전 기존 `public` schema와 충돌 가능성을 읽기 전용으로 확인하려 했다.
`supabase db dump --linked --schema public --dry-run`은 실행될 명령만 보여주고 연결 자격증명은
노출하지 않을 것으로 예상했다.

### 실제 동작과 영향

CLI는 `pg_dump` shell script와 함께 `cli_login_postgres` 임시 역할의 접속 환경변수를 터미널에
출력했다. 값은 파일, Git, 외부 검색, 문서에 저장하지 않았고 실제 service key나 프로젝트의
영구 `postgres` 비밀번호는 아니었다. 운영 데이터 변경 전 발견했다.

### 재현·증거와 근본 원인

linked 프로젝트에서 해당 명령을 실행하면 CLI가 실제 dump 대신 `PGHOST`, `PGUSER`,
`PGPASSWORD`를 포함한 실행 script를 출력한다. `--dry-run`이 DB schema의 읽기 전용 미리보기가
아니라 내부 `pg_dump` command 전체를 보여주는 동작임을 명령 출력으로 확인했다.

### 대응과 선택

- 프로젝트를 즉시 unlink 후 relink해 임시 login role 자격증명을 재발급했다.
- 값이 다른 명령, 파일, 로그 또는 외부 도구로 전달되지 않았는지 확인했다.
- 영구 DB 비밀번호 회전은 실제로 노출된 자격증명이 아니므로 불필요한 운영 변경으로 판단해
  수행하지 않았다.
- schema 사전 확인은 `migration list`, `inspect db table-stats`, `db lint --linked`와
  `db push --dry-run`으로 대체했다. 이후 명령은 자격증명 값을 출력하지 않았다.

### 검증과 회귀 방지

재연결 뒤 migration 적용, 원격 lint, 직접 RLS, 실제 repository adapter와 production HTTP 종단
검증이 모두 통과했다. Supabase CLI link metadata는 `supabase/.temp/`로 Git에서 제외했다.
운영 세션을 캡처하거나 공유하는 환경에서는 `db dump --dry-run`을 사용하지 않는다.

### 남은 위험과 면접 질문

기존 터미널 출력은 소급 삭제할 수 없지만 임시 credential은 재발급했고 저장·커밋되지 않았다.
왜 전체 DB 비밀번호를 회전하지 않았는가? 노출된 값은 CLI가 생성한 임시 login role 값이었고,
영구 credential을 바꾸면 불필요한 서비스 영향만 추가되기 때문이다.

## 2026-08-25 — 예약 API의 same-origin 검사가 정상 `127.0.0.1` 요청을 거절함

### 맥락과 기대 동작

공개 예약 API는 JSON과 same-origin 브라우저 요청만 허용하면서 `localhost`, `127.0.0.1`,
reverse proxy를 거친 production 요청을 정상 처리해야 했다. 이 검사는 공개 endpoint의 교차 출처
데이터 주입을 줄이되 실제 예약을 막아서는 안 된다.

### 실제 동작과 영향

production E2E에서 공개 예약 관련 시나리오 4개가 모두 저장 오류를 표시했다. 브라우저 요청은
`http://127.0.0.1:3100`의 정상 same-origin POST였지만 API가 403 `invalid_origin`을 반환했다.
배포 전 자동 테스트에서 발견돼 실제 사용자 데이터 영향은 없다.

### 재현과 증거

1. Next.js production server를 `127.0.0.1:3100`에서 실행한다.
2. `/p/[slug]`에서 이름·이메일·동의를 입력하고 예약한다.
3. Playwright trace의 요청 `Origin`과 `Host`는 모두 `127.0.0.1:3100`이다.
4. Route Handler 응답은 403 `invalid_origin`이고 화면은 저장 실패를 표시한다.

API body, 비밀값과 개인정보는 기록하지 않았고 trace의 header와 상태 코드만 원인 확인에 사용했다.

### 검토한 가설과 근본 원인

- JSON Content-Type 누락: trace에서 `application/json`을 확인해 제외했다.
- fixture repository 실패: repository 호출 전 403이라 제외했다.
- 교차 출처 요청: 브라우저 `Origin`, `Host`, `Referer`가 모두 같아 제외했다.

Next.js가 Route Handler의 내부 `request.url` host를 `localhost`로 정규화한 반면 실제 브라우저
요청의 `Origin`과 `Host`는 `127.0.0.1`이었다. `Origin`을 `request.url.origin`과만 비교해 정상
요청을 다른 출처로 오판한 것이 근본 원인이다.

### 대안과 해결

- origin 검사를 제거하면 회귀는 사라지지만 공개 mutation의 브라우저 보안 경계가 약해져 기각했다.
- 고정된 local host를 예외 처리하면 production proxy와 preview host를 설명하지 못해 기각했다.
- 브라우저가 제어하는 `Host`와 신뢰한 proxy의 `X-Forwarded-Host`·`X-Forwarded-Proto`를 우선하고,
  `request.url`은 fallback으로만 사용하도록 비교 기준을 바꿨다.

잘못된 Origin 형식, host 또는 protocol 불일치는 계속 403으로 거절하고 JSON이 아니면 415로
거절한다.

### 검증과 회귀 방지

- Host와 내부 request URL이 다른 정상 요청, 교차 origin, 잘못된 Content-Type 단위 테스트 통과
- 기존 실패 시나리오 4개 focused Chromium E2E 통과
- production Chromium E2E 16개 전체 통과
- `pnpm check`의 lint·typecheck·단위 테스트 104개와 production build 통과

production에서는 Vercel이 설정한 forwarded header만 신뢰하며, 임의 proxy를 앱 앞에 추가할 때는
해당 proxy가 외부 입력 header를 덮어쓰는지 다시 확인해야 한다.

### 면접 질문과 답변 근거

- 왜 `request.url`만 비교하면 안 됐나? 프레임워크나 reverse proxy가 내부 host로 정규화할 수 있어
  브라우저가 실제로 접속한 authority와 달라질 수 있기 때문이다.
- 검사를 없애지 않은 이유는 무엇인가? 공개 예약 mutation의 교차 출처 데이터 주입 경계를
  유지하면서 정상 proxy 환경만 정확히 해석하는 것이 목적이기 때문이다.

## 2026-08-25 — 127.0.0.1에서 시작한 Google OAuth callback 실패

### 맥락과 기대 동작

로컬 production 서버를 `127.0.0.1:3000`에 bind한 상태에서도 사용자는 Google 로그인을 시작하고, 설정된 `http://localhost:3000/auth/callback`에서 PKCE code를 세션으로 교환할 수 있어야 했다.

### 실제 동작과 영향

`127.0.0.1` 링크에서 Google 로그인을 시작하면 provider 동의 뒤 `/auth/error?code=callback_failed`로 이동했다. 로컬 OAuth 검증만 막혔고 production 배포와 사용자 영향은 없다.

### 재현과 증거

1. 브라우저에서 `http://127.0.0.1:3000`을 연다.
2. Google 로그인을 시작한다.
3. 로그인 시작 응답은 PKCE verifier를 `127.0.0.1`의 host-only cookie로 설정한다.
4. `NEXT_PUBLIC_SITE_URL`에 따라 callback은 `http://localhost:3000/auth/callback`으로 돌아온다.
5. callback 요청에는 다른 host의 verifier cookie가 없어 code 교환이 실패한다.

서버 응답을 비밀값 없이 검사해 요청 origin은 `127.0.0.1`, callback origin은 `localhost`이고 PKCE cookie가 로그인 시작 host에 설정되는 것을 확인했다.

### 근본 원인과 해결

OAuth의 시작 origin과 callback origin이 달랐다. `localhost`와 `127.0.0.1`은 같은 컴퓨터를 가리켜도 cookie 기준으로는 서로 다른 host다. 로그인 handler가 Supabase client와 PKCE cookie를 만들기 전에 요청 origin을 `NEXT_PUBLIC_SITE_URL`과 비교하고, 다르면 query를 보존한 canonical `/auth/google`로 먼저 redirect하도록 수정했다.

### 검증과 회귀 방지

단위 테스트는 Next.js가 `request.url`을 canonical 값으로 정규화하더라도 실제 `Host`·`X-Forwarded-Host`가 `127.0.0.1`이면 `localhost`로 redirect되고 Supabase 호출과 continuation cookie 생성이 일어나지 않는지 검증한다. 최종 인증 focused 테스트 20개, 전체 단위 테스트 73개, configured bundle smoke와 production E2E 14개가 통과했다. 실제 Chrome에서도 `127.0.0.1` 시작, `localhost` canonical 이동, Google 계정 선택, Supabase callback과 로그인 사용자 표시를 확인했다. production에서는 `NEXT_PUBLIC_SITE_URL`, Supabase Site URL·Redirect URL과 실제 공개 origin을 동일하게 유지해야 한다.

### 면접 질문과 답변 근거

- 같은 컴퓨터인데 왜 OAuth가 실패했나? 쿠키의 host 경계에서 `localhost`와 `127.0.0.1`은 별개이기 때문이다.
- callback에서 억지로 복구하지 않은 이유는 무엇인가? verifier가 없는 callback에서는 안전한 code 교환이 불가능하므로, 쿠키 생성 전 origin을 정규화해야 한다.

## 2026-08-25 — 실제 Supabase Auth 설정 후 GNB가 미설정으로 남음

### 맥락과 기대 동작

Google Web client, Supabase Google provider와 local 공개 환경변수를 연결한 production build에서 GNB가 `Google로 로그인`을 표시하고 session API를 조회해야 했다.

### 실제 동작과 영향

`GET /api/auth/session`은 200, `GET /auth/google`은 Google로 302를 반환했지만 GNB는 `로그인 준비 중`으로 남았다. local 실제 계정 검증만 막혔고 fixture 데모와 공개 랜딩에는 영향이 없었다. 배포 전 발견했으므로 production 사용자 영향은 없다.

### 재현과 타임라인

1. `.env.local`에 Supabase URL과 publishable key를 설정한다.
2. production build와 `next start`를 실행한다.
3. 서버 인증 endpoint가 설정을 읽는지 확인한다.
4. `/`를 열면 GNB만 미설정 fallback을 표시한다.

2026-08-25 Google·Supabase 외부 설정 직후 재현했고 같은 세션에서 원인 확인, 수정, 실제 로그인·로그아웃 검증까지 완료했다.

### 검토한 가설과 증거

- 잘못된 Supabase URL·key: 값의 형식과 서버 endpoint 성공으로 제외했다.
- 이전 build 또는 서버 환경: `.env.local`을 읽는 새 production build에서도 재현되어 제외했다.
- provider·redirect 오류: 로그인 시작 전 GNB에서 막히고 서버 302는 정상이라 직접 원인이 아니었다.
- client 환경 경계: `app/page.tsx`가 client component이고 그 import 경로의 `SiteHeader`가 `process.env` 객체 전체를 설정 helper에 넘기는 것을 확인했다.

### 근본 원인

Next.js client bundle은 `process.env.NEXT_PUBLIC_*`의 정적 참조만 치환한다. `hasCompleteSupabaseConfig()`의 기본 인자로 `process.env` 객체 전체를 넘긴 코드는 브라우저에서 빈 환경을 읽어, 같은 설정을 서버는 인식하고 GNB는 인식하지 못했다.

### 대안과 선택

- 홈을 server wrapper와 client dashboard로 분리해 `authEnabled`를 prop으로 전달하는 방법은 경계가 가장 명확하지만 이번 수정 범위보다 큰 화면 구조 변경이 필요했다.
- 공개 환경변수를 client bundle에서 명시적으로 정적 참조하는 helper는 현재 GNB 계약을 유지하며 최소 변경으로 같은 경계를 보장한다.

두 번째 방법을 적용하고, 향후 홈 구조를 server/client로 재편할 때 prop 전달 방식으로 옮길 수 있게 helper 사용 지점을 `SiteHeader` 하나로 제한했다.

### 해결과 검증

`hasCompleteBundledSupabaseConfig()`가 각 `NEXT_PUBLIC_SUPABASE_*` 값을 정적으로 읽도록 하고 `SiteHeader`가 이를 사용하게 했다. 단위 회귀 테스트를 추가하고 Playwright web server에는 Supabase 공개 환경변수를 빈 값으로 명시해 개인 `.env.local`과 관계없이 미설정 fallback을 검증한다. 별도 configured production bundle smoke는 dummy 공개 설정으로 build한 홈 HTML이 세션 확인 초기 상태를 포함하고 미설정 fallback을 포함하지 않는지 확인한다.

수정 후 GNB 로그인 버튼, 실제 Google 동의, Supabase PKCE callback, 사용자 표시, Supabase Auth 사용자 생성, POST 로그아웃과 익명 복귀를 확인했다. 단위 테스트 67개와 production Chromium E2E 14개, lint·typecheck·coverage·audit·peer·diff 검사가 통과했다.

### 회귀 방지와 남은 위험

- client 코드에서 `process.env` 객체 전체를 전달하지 않는다.
- 설정된 실제 종단 검증, configured bundle smoke와 미설정 fixture E2E를 분리한다.
- production domain과 Vercel 환경변수, 실제 도메인의 토큰 갱신·동시 탭 OAuth는 배포 후 확인해야 한다.
- 로그인은 연결됐지만 광고 데이터는 아직 메모리 fixture이므로 G3 RLS 전에는 인증을 소유권 보장으로 간주하지 않는다.

### 면접 질문과 답변 근거

- 서버 endpoint는 됐는데 UI만 실패한 이유는 무엇인가? 서버는 런타임 `process.env`를 읽었지만 client bundle은 정적으로 참조된 공개 변수만 치환했기 때문이다.
- 왜 환경변수 값을 client에 보내도 안전한가? URL과 publishable key는 공개 client 설정이고, Google Client Secret과 service-role key는 Supabase provider와 서버 경계 밖으로 내보내지 않았다.
- 테스트가 개인 환경에 의존하지 않게 한 방법은 무엇인가? Playwright web server에서 공개 Auth 변수를 명시적으로 비워 미설정 fallback을 결정적으로 빌드했다.

## 2026-08-25 — 예약 API 전환 뒤 typecheck와 E2E가 옛 신호 계약을 참조함

### 맥락과 기대 동작

ADR-0013에 따라 `/api/signals`와 익명 3지선다 화면을 `/api/reservations`와 이름·이메일 예약 폼으로 바꾼 뒤, 로컬 OpenAI adapter와 원격 변경을 같은 `main`에 합쳐야 했다. 통합 상태에서 lint, typecheck, 단위 테스트와 production E2E가 모두 새 계약을 검증해야 했다.

### 실제 동작과 영향

Git 병합은 `app/api/_lib/http.ts` 한 곳에서 충돌했고, 첫 typecheck는 삭제된 `app/api/signals/route.ts`를 `.next/dev/types/validator.ts`가 계속 import해 실패했다. 캐시를 정리한 뒤에는 단위 테스트가 통과했지만 E2E가 옛 지표·버튼·API를 기다려 6건 실패하고 1건이 중단됐다. 배포 전 로컬 통합에서 발견돼 production 영향은 없다.

### 재현과 증거

1. OpenAI adapter 커밋 위에 예약자명단 원격 커밋을 merge한다.
2. `pnpm check`를 실행하면 `.next/dev/types/validator.ts`의 `/api/signals` import에서 `TS2307`이 발생한다.
3. 생성 route type을 새로 만든 뒤 `pnpm test:e2e`를 실행한다.
4. `선택형 응답`, `긍정 신호율`, `네, 써보고 싶어요`, `/api/signals`를 기다리는 테스트가 새 화면에서 실패한다.

충돌 전 staged tree와 충돌 해결 뒤 merge tree 해시는 `c9e5d97cb8520831635689f49228dc10c53623fc`로 일치했다. 이는 구형 `InvalidSignalOptionError`만 제거하고 OpenAI의 두 503 오류 처리를 보존한 결과가 사전 통합 스냅샷과 같다는 근거다.

### 검토한 가설과 근본 원인

- route 구현 누락: `/api/reservations` 단위 테스트와 production route 목록에서 존재를 확인해 제외했다.
- Next.js typegen 결함: `next typegen`은 `.next/types`를 갱신하지만 실행 중이던 이전 개발 서버가 만든 `.next/dev/types`도 `tsconfig.json` 검사 대상에 남아 있었다.
- 제품 회귀: 앱은 새 폼과 리포트를 정상 렌더링했고, 실패 locator가 모두 삭제된 신호 계약을 가리켰다.

원인은 API·화면 계약을 바꾼 커밋에 E2E 재작성이 함께 포함되지 않았고, route rename 중 실행 중이던 개발 서버의 생성 type cache가 남은 두 가지였다.

### 해결과 대안

생성 캐시를 삭제하는 대신 작업 공간 밖 임시 디렉터리로 옮겨 복구 가능하게 보존하고 `next typegen`을 다시 실행했다. E2E를 비활성화하거나 assertion을 줄이지 않고 예약 입력, 동의, 성공·중복, 실제 명단, 빈 상태, 오류 재시도, 모바일 키보드, 캠페인 격리와 polling 계약으로 전면 교체했다. cache header는 문자열 전체 일치 대신 `no-store` 포함을 요구해 Next.js의 더 강한 `private, no-cache` 지시를 허용했다.

### 검증과 회귀 방지

- focused 단위 테스트 5파일 33개 통과
- lint·typecheck·단위 테스트 14파일 72개 통과
- configured production auth/server-secret bundle smoke 통과
- production Chromium E2E 14개 통과
- statements 79.29%, branches 73.02%, functions 84.02%, lines 82.32% coverage와 high audit·peer·diff 검사 통과
- GitHub Actions run `32811937835`의 clean checkout 전체 gate 통과

route를 rename할 때는 route 구현, API 계약, E2E endpoint, 접근성 locator와 `.next/dev/types`를 한 작업 단위로 확인한다. CI의 깨끗한 checkout은 stale cache를 재현하지 않으므로 로컬 typecheck도 계속 유지한다.

### 남은 위험과 면접 질문

fixture는 서버 메모리이며 로그인 소유권과 RLS가 아직 연결되지 않았다. production 배포 전 G3에서 예약 원문을 광고 소유자에게만 반환하고 공개 경로에는 노출하지 않아야 한다.

- 왜 단위 테스트는 통과했는데 E2E는 실패했나? repository와 API 단위 계약은 바뀌었지만 사용자 시나리오 locator가 옛 화면 문구와 endpoint를 그대로 사용했기 때문이다.
- 왜 cache header를 정확한 문자열로 비교하지 않았나? 핵심 보안 속성은 `no-store`이며 Next.js가 추가한 `private`와 `no-cache`는 이를 약화하지 않고 강화하기 때문이다.
- 충돌 해결이 양쪽 기능을 보존했다는 근거는 무엇인가? merge 전 준비된 통합 index와 해결 뒤 tree hash를 직접 비교해 동일함을 확인했다.
