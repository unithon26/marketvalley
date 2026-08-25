# Google 로그인 백엔드 운영 가이드

상태: 로컬 Google·Supabase provider 연결과 실제 계정 로그인·로그아웃 검증 완료, production URL 설정 대기
기준일: 2026-08-25

marketvalley 로그인은 Google 토큰을 애플리케이션이 직접 교환하거나 저장하지 않고 Supabase Auth의 Authorization Code + PKCE 흐름을 사용한다. 브라우저 JavaScript에는 access token과 refresh token을 노출하지 않는다. Next.js Route Handler와 Proxy가 HttpOnly 쿠키 세션을 소유한다.

## 애플리케이션 계약

| 동작 | 계약 |
| --- | --- |
| Google 로그인 시작 | `GET /auth/google?next=/campaigns/...` |
| OAuth code 교환 | `GET /auth/callback` — Supabase가 호출 |
| 로그인 상태 조회 | `GET /api/auth/session` |
| 현재 기기 로그아웃 | same-origin `POST /auth/logout?next=/` |
| 인증 오류 | `GET /auth/error?code=...` |

`next`는 같은 앱의 화면 경로만 허용한다. 외부 URL, `/auth/*`, `/api/*`, 역슬래시와 제어문자가 포함된 값은 `/`로 바꾼다. 이동 경로는 PKCE flow ID별 10분짜리 HttpOnly 쿠키에 저장하고 callback URL 자체는 고정한다. 나중에 디자인을 교체할 때 로그인 버튼은 첫 route로 이동하고, GNB는 session API의 `authenticated`와 최소 사용자 정보만 사용하면 된다. 로그아웃은 링크가 아니라 POST form 또는 same-origin fetch로 호출해야 한다.

현재 GNB에는 임시 `AuthControls`가 연결되어 있다. `lib/client/use-auth-session.ts`가 상태와 API 계약을 소유하고 `components/auth-controls.tsx`는 표현만 소유한다. 디자이너 버튼을 받으면 hook과 route는 유지하고 이 컴포넌트의 markup과 `auth-*` CSS만 교체한다. Supabase가 미설정된 발표 모드에서는 session API를 반복 호출하지 않고 `로그인 준비 중`을 표시한다.

서버에서 소유권을 확인하는 데이터 작업은 `requireVerifiedIdentity()`로 서명 검증된 JWT의 `sub`를 사용한다. session API는 Supabase Auth 서버의 `getUser()`로 최신 사용자를 다시 확인한다. 쿠키에서 읽은 `getSession()` 사용자 객체를 권한 판단에 사용하지 않는다.

## 로컬 환경변수

`.env.local`에 아래 공개 설정만 둔다. Google Client Secret은 이 파일에 넣지 않고 Supabase Dashboard에만 등록한다.

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

legacy 프로젝트는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 호환하지만 새 설정은 publishable key를 사용한다. `SUPABASE_SERVICE_ROLE_KEY`는 사용자 로그인에 필요하지 않으며 브라우저와 인증 route에서 사용하지 않는다.

로컬 앱은 `http://localhost:3000`으로 연다. `127.0.0.1`처럼 설정된 Site URL과 다른 origin에서 OAuth를 시작하면 PKCE 쿠키의 host가 callback과 달라질 수 있으므로, 로그인 route는 쿠키를 만들기 전에 위 canonical origin으로 이동한다.

## Google Auth Platform 설정

Google OAuth client는 `Web application` 유형을 사용한다.

1. Authorized JavaScript origins에 로컬 `http://localhost:3000`과 실제 배포 origin을 등록한다.
2. Authorized redirect URIs에는 Supabase Dashboard의 Google provider 화면에 표시된 callback을 정확히 등록한다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Google Console에 넣는 redirect URI는 marketvalley의 `/auth/callback`이 아니다. Google은 먼저 Supabase Auth callback으로 돌아오고, Supabase가 PKCE code와 함께 marketvalley의 `/auth/callback`으로 이동시킨다. 로컬 Supabase CLI를 별도로 쓸 때만 `http://127.0.0.1:54321/auth/v1/callback`을 추가한다.

Google Data Access에는 `openid`, `userinfo.email`, `userinfo.profile`만 사용한다. 추가 Google API scope가 필요한 기능은 현재 범위에 없다.

## Supabase Dashboard 설정

1. Authentication → Providers → Google에서 provider를 활성화하고 Google Client ID와 Client Secret을 저장한다.
2. Authentication → URL Configuration의 Site URL을 실제 production origin으로 설정한다.
3. Redirect URLs에 다음 callback 제한 패턴을 추가한다.

```text
http://localhost:3000/auth/callback\?sb_flow_id=*
https://<production-domain>/auth/callback\?sb_flow_id=*
```

동시 로그인 흐름을 안전하게 분리하기 위해 Supabase SDK가 callback에 예약 query `sb_flow_id`를 붙인다. Supabase allow-list는 query까지 포함한 전체 URL을 비교하므로 query 없는 exact callback만 등록하면 Site URL로 fallback할 수 있다. 위 패턴의 `\?`는 실제 물음표를, 마지막 `*`는 영문·숫자·밑줄·하이픈으로 구성된 flow ID를 허용한다. production Site URL은 반드시 같은 production origin으로 설정한다. Vercel preview에서 실제 로그인을 검증할 때만 팀 slug가 제한된 preview origin과 같은 callback query 패턴을 별도로 추가하고, 해당 배포의 `NEXT_PUBLIC_SITE_URL`도 일치시킨다.

## 보안 불변조건

- Auth 쿠키는 `HttpOnly`, `SameSite=Lax`, `Path=/`이며 production에서는 `Secure`다.
- 두 개 이상의 로그인 창은 `sb_flow_id`별 PKCE verifier와 이동 경로 쿠키로 분리하며 callback에서 같은 flow ID를 명시해 code를 교환한다.
- 로그인·callback·session·logout 응답은 private no-store이고 callback code가 referrer로 전달되지 않게 한다.
- 로그아웃은 `Origin`이 `NEXT_PUBLIC_SITE_URL`과 정확히 같은 POST만 받으며 현재 세션에만 `scope=local`을 적용한다.
- OAuth provider 오류와 Supabase 내부 오류 문구는 URL이나 사용자 응답에 그대로 노출하지 않는다.
- Proxy는 세션 갱신을 담당하지만 권한 판단의 근거로 사용하지 않는다. 보호된 데이터 작업이 `requireVerifiedIdentity()`를 다시 호출한다.
- Supabase 설정 또는 Auth 네트워크가 실패해도 공개 랜딩과 fixture 데모 전체가 같이 중단되지 않는다. 인증 endpoint만 명시적인 오류를 반환한다.

## 실제 연동 완료 기준

- 로그아웃 상태에서 session API가 `authenticated: false`를 반환한다.
- Google 동의 뒤 callback code가 한 번만 교환되고 session API가 현재 사용자 최소 정보만 반환한다.
- 새로고침과 access token 갱신 뒤 로그인이 유지된다.
- 두 탭의 callback이 시작 역순으로 돌아와도 각 화면과 세션 code가 올바른 flow로 교환된다.
- 교차 origin 로그아웃과 외부 `next` redirect가 거절된다.
- 로그아웃 뒤 session API가 비로그인 상태로 돌아가고 다른 기기의 세션은 유지된다.
- Supabase RLS와 repository가 `auth.uid()` 기준으로 자신의 광고만 변경·삭제하게 한다.

마지막 항목은 G3 Supabase 데이터 adapter에서 구현한다. 현재 로그인 백엔드는 준비됐지만 기존 fixture 광고 route에 로그인 강제를 적용하지 않았으므로 발표 데모는 그대로 실행된다.

## 2026-08-25 실제 검증 결과

- Google Web client의 local origin과 Supabase Auth callback을 등록했다.
- Supabase Google provider, local Site URL, flow ID가 포함된 Redirect URL 패턴과 publishable key를 연결했다.
- 실제 Google 동의, Supabase callback, HttpOnly 세션 생성, GNB 사용자 표시, 현재 세션 POST 로그아웃과 익명 상태 복귀를 확인했다.
- Supabase Authentication에 Google provider 사용자 한 명이 생성된 것을 확인했다.
- production origin·Redirect URL과 Vercel 환경변수는 배포 시점에 별도로 설정해야 한다.
- 동시 flow 역순 callback과 토큰 갱신은 자동 회귀 테스트로 검증했으며, production 다중 탭 수동 검증은 배포 뒤 남아 있다.

## 공식 참고 자료

- [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase SSR client 구성](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase 로그아웃 scope](https://supabase.com/docs/guides/auth/signout)
- [Next.js 인증 가이드](https://nextjs.org/docs/app/guides/authentication)
