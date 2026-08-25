# ADR-0012: Google 로그인을 Supabase PKCE와 서버 route 뒤에 둔다

상태: 채택
기준일: 2026-08-25

## 배경

제품 UI의 로그인 디자인은 아직 확정되지 않았지만 Google OAuth client 생성은 redirect URI 등록 직전까지 진행됐다. 이후 Supabase 데이터 adapter와 광고별 사용자 소유권을 연결하려면 화면과 독립적인 로그인·세션·로그아웃 계약이 먼저 필요하다. Google 토큰을 직접 교환하고 별도 세션 저장소까지 운영하면 짧은 일정에 중복된 인증 책임과 실패 지점이 생긴다.

## 결정

- Supabase Auth의 Google provider와 Authorization Code + PKCE를 사용한다.
- `GET /auth/google`, `GET /auth/callback`, `GET /api/auth/session`, `POST /auth/logout`을 디자인과 무관한 서버 계약으로 제공한다.
- Next.js 서버 Route Handler가 OAuth 시작과 code 교환을 수행하고 access·refresh token은 HttpOnly 쿠키에만 저장한다. UI는 토큰을 읽지 않고 session API만 사용한다.
- SDK의 흐름별 PKCE verifier를 활성화하고 `sb_flow_id`를 callback code 교환에 명시한다. 로그인 후 이동 경로는 flow ID별 짧은 HttpOnly 쿠키에 분리한다.
- 배포 origin은 `NEXT_PUBLIC_SITE_URL`로 고정한다. `next`는 같은 앱의 비인증 화면 경로만 허용해 open redirect를 막는다.
- Proxy는 만료 토큰 갱신만 담당한다. 보호된 데이터 작업은 `getClaims()` 기반 `requireVerifiedIdentity()`로 서명 검증된 `sub`를 다시 확인하고, session 표시는 `getUser()`로 최신 사용자 레코드를 확인한다.
- 로그아웃은 same-origin POST와 현재 세션 범위만 허용한다.
- 기존 fixture 광고 route에는 아직 로그인 강제를 적용하지 않는다. G3 Supabase repository와 RLS에서 `auth.uid()` 소유권을 연결한 뒤 보호 범위를 전환한다.

## 기각한 대안

### Google OAuth를 애플리케이션에서 직접 구현한다

provider code 교환, refresh token 보관·회전, 세션 폐기와 사용자 저장소를 별도로 운영해야 한다. 이미 선택한 Supabase와 책임이 겹치고 RLS의 `auth.uid()` 연결도 복잡해져 기각했다.

### 브라우저 Supabase client가 OAuth와 세션을 직접 소유한다

구현량은 적지만 토큰을 브라우저 JavaScript에서 다루게 되고 UI 구현 방식에 인증 계약이 결합된다. 현재는 서버 BFF가 쿠키를 소유하고 UI에는 최소 session 응답만 제공한다.

### 디자인이 나온 뒤 인증 전체를 구현한다

화면 재작업은 줄지만 redirect·쿠키·세션·소유권 같은 위험한 경계를 마지막에 검증하게 된다. 서버 계약을 먼저 고정하면 디자인은 endpoint 소비만 담당하므로 기각했다.

## 결과

로그인 디자인 없이도 Google 로그인 시작부터 callback, 세션 확인, 안전한 로그아웃과 서버 권한 helper까지 자동 검증할 수 있다. 임시 GNB는 상태 hook과 표현 컴포넌트를 분리해 디자이너 확정본으로 쉽게 교체할 수 있다. Google Console의 redirect URI는 Supabase callback이며 marketvalley callback은 예약 `sb_flow_id` query를 허용하는 제한 패턴으로 Supabase Redirect URLs에 등록한다. 실제 계정 종단 검증과 광고 소유권·RLS 연결은 외부 설정과 G3 데이터 adapter가 필요하다.

`@supabase/ssr`는 upstream 기준 beta이므로 `0.12.5`를 정확히 고정하고 cookie adapter·Proxy 회귀 테스트를 유지한다. 패키지를 갱신할 때는 Supabase SSR client와 Next.js Proxy 가이드를 다시 확인한다.
