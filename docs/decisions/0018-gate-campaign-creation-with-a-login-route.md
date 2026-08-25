# ADR-0018: 광고 생성 진입을 로그인 route와 모달로 보호한다

- 상태: 채택
- 날짜: 2026-08-25

## 맥락

Google OAuth와 서버 세션 계약은 구현돼 있었지만 비로그인 사용자가 `/new`의 두 입력 단계를 모두 진행한 뒤 `POST /api/generate`에서야 인증 오류를 만났다. 디자이너의 최신 Figma는 기능 시작 시점에 배경을 어둡게 덮은 로그인 카드와 확정 `market valley` 로고를 보여준다.

## 결정

Supabase Auth 설정이 있는 제품 환경에서 광고 생성 CTA는 session API를 확인하고, 비로그인 사용자를 `/login?next=/new`로 이동시킨다. client soft navigation에서는 root parallel slot의 intercepting route가 현재 화면 위 로그인 모달을 렌더링한다. 직접 URL 접근과 새로고침은 같은 route의 전용 로그인 화면을 렌더링한다.

`/new`는 서버 렌더링 전에 `requireVerifiedIdentity()`로 세션을 다시 확인한다. 세션이 없으면 `/login?next=/new`로 이동하고, 기존 PKCE continuation 쿠키가 인증 뒤 `/new` 복귀를 담당한다. OAuth 취소와 오류도 JSON 응답 대신 같은 로그인 카드에서 복구한다. client 상태 확인과 모달은 사용성 경계이고 권한 경계는 서버와 RLS에 남긴다.

홈과 공개 랜딩 `/p/[slug]`는 로그인 없이 유지한다. Supabase 설정이 없는 자동 테스트·비상 발표 fixture에서는 `/new`를 계속 열어 외부 인증 장애가 발표 경로를 막지 않게 한다.

## 기각한 대안

- 입력을 모두 받은 뒤 생성 API에서만 로그인 요구: 사용자가 작성한 뒤 막히고 Figma의 진입 시점과 다르다.
- 홈 CTA에만 상태를 둔 독립 모달: 직접 `/new`로 들어오는 경로를 보호하지 못하고 URL·뒤로가기를 공유하지 못한다. 전용 route와 서버 gate를 유지한 intercepting modal로 해결한다.
- 모든 화면을 로그인 뒤로 이동: 공개 랜딩과 비상 fixture 데모의 목적을 깨뜨린다.

## 결과

비로그인 사용자는 현재 화면의 맥락을 잃지 않고 인증 필요성을 확인하며, 직접 링크와 새로고침도 전용 화면으로 복구된다. 인증 뒤 원래 목적지로 돌아온다. 실제 데이터 권한은 별도의 Supabase RLS와 소유자 route가 계속 담당하며, 이 화면 전환만으로 권한 검사가 완료됐다고 보지 않는다.
