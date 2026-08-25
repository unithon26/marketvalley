# Troubleshooting

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
