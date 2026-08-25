# ADR-0021: 회사 내부 운영자만 Meta PAUSED 초안을 만든다

날짜: 2026-08-25

## 결정

회사 소유 Meta 광고 계정 쓰기는 Supabase 사용자 UUID allowlist에 등록된 내부 운영자에게만 허용한다. 일반 사용자는 광고 결과물과 게시 준비 ZIP을 만들 수 있지만 Meta API를 호출할 수 없다. 서버는 계정·Page·Instagram·destination·예산·일정과 `PAUSED` 상태를 고정하고, client는 캠페인 ID와 카드 PNG 5장만 보낸다.

외부 쓰기 전 durable ledger에 시도를 기록하고 각 단계 ID를 checkpoint한다. 응답이 불확실하면 자동 재시도하지 않고 사람이 Ads Manager와 ledger를 대조할 때까지 reconciliation 상태로 둔다. `ACTIVE` 전환, 결제수단 관리와 실제 집행은 구현하지 않는다.

운영 자산 검증은 광고계정 ID, 고정 Page ID의 직접 조회, Page가 가리키는 Instagram professional account ID와 광고계정의 Instagram account 목록을 순서대로 대조한다. System User token에서 빈 목록을 반환한 `promote_pages`는 Page 권한의 간접 증거로 사용하지 않는다.

## 이유

모든 로그인 사용자가 공유 회사 광고 계정에 쓰면 PAUSED여도 임의 이미지와 대량 객체로 계정을 오염시키거나 정책 위반 검토를 유발할 수 있다. 내부 운영자 제한은 회사 계정에 대한 사람의 책임을 유지하면서 발표에서 수작업 등록 단계를 제거한다.

PNG는 구조·CRC·1080×1350 RGBA 형식까지 검증하지만 client renderer 산출물임을 암호학적으로 증명하지 않는다. 내부 운영자를 신뢰 경계로 두며, 일반 사용자에게 이 endpoint를 공개하려면 서버 측 결정적 이미지 렌더링 또는 서버 발급 artifact 서명이 먼저 필요하다.

서버에 이미 Page와 Instagram ID를 고정하므로 간접 목록을 추론하는 것보다 두 자산을 직접 읽고 Page→Instagram 관계를 대조하는 편이 설명 가능하고 실패 원인이 명확하다. 광고계정에서 사용할 Instagram identity도 별도 edge로 확인해 광고계정, Page와 Instagram 세 경계를 모두 fail-closed로 검증한다.

## 기각한 대안

### 모든 캠페인 소유자에게 허용

사용 흐름은 짧지만 공유 회사 계정의 콘텐츠와 정책 책임을 일반 사용자에게 넘기므로 기각했다.

### 곧바로 ACTIVE 광고까지 생성

실제 지출과 결제·예산 승인을 자동화하면 사람이 져야 할 재무 책임을 제거한다. 해커톤 P1 범위를 넘고 사고 시 되돌리기 어려워 기각했다.

### process-local 중복 방지

재시작과 다중 요청에서 외부 객체 중복을 막지 못하므로 Supabase RPC 기반 durable ledger를 사용한다.

### `promote_pages`만으로 Page 연결 검증

실제 System User token에서 Page 직접 조회와 Page→Instagram 조회는 성공했지만 `promote_pages`는 빈 목록이었다. 빈 간접 목록 때문에 유효한 고정 자산을 거부하고 원인도 구분하지 못하므로 기각했다.
