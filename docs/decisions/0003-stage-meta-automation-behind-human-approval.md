# ADR-0003: Meta 자동화는 사람 승인 뒤 단계적으로 연다

상태: 채택
날짜: 2026-08-24

## 배경

초기 기획에는 인스타그램 광고 등록, 예산 결제와 결과 취합까지 자동화하는 흐름이 포함됐다. Meta Marketing API와 공식 Business SDK로 campaign, ad set, creative, ad를 생성하고 상태를 바꾸며 Insights를 조회할 수 있다. 그러나 SDK는 Marketing API의 wrapper일 뿐 권한, App Review, 사업자 확인이나 결제 제약을 없애지 않는다.

광고 예산은 결제 카드 등록 행위가 아니라 광고 계정이 사용할 지출 한도다. 광고 계정의 기존 funding source, 본인 확인과 3-D Secure 등은 Meta UI에서 사용자가 처리해야 한다. 실제 계정 쓰기와 광고비 집행은 해커톤 핵심인 검증 캠페인 제작·응답 흐름보다 실패 범위와 외부 의존성이 크다.

## 결정

Meta 연동을 제품 단계별로 분리한다.

### P0

- 실제 Meta OAuth, 계정 연결, 광고 객체 쓰기와 광고비 집행을 하지 않는다.
- `CampaignSpec`, 캐러셀 export와 공개 랜딩 URL을 사용해 `Meta 게시 준비` 화면을 만든다.
- 기본 문구, headline, CTA, 대상 고객 가설, 미디어 파일과 destination URL을 한곳에서 복사·확인한다.
- 예산, 통화, 기간, 세부 타기팅과 활성화는 자동 확정하지 않는다.

### 해커톤 P1

- P0, 배포와 발표 준비가 모두 안정된 경우에만 시작한다.
- 팀 소유 테스트 광고 계정과 필요한 권한이 이미 준비된 경우 `PAUSED` 상태 객체 생성까지만 실험한다.
- 클라이언트와 서버 양쪽에서 `ACTIVE` 전환을 막고 실제 지출을 발생시키지 않는다.
- P1이 P0 통합을 1시간 이상 지연하면 즉시 제거한다.

### 실제 제품

1. 사용자가 OAuth로 연결하고 광고 계정, Facebook Page와 Instagram identity를 직접 선택한다.
2. 서버가 account binding과 권한을 다시 검증하고 `PAUSED` 초안을 만든다.
3. 계정, 통화, 시간대, identity, 소재, 랜딩 URL, 타기팅, 총예산과 종료 시각을 포함한 승인 snapshot을 보여준다.
4. 사용자가 명시적으로 승인한 snapshot과 실제 쓰기 payload가 일치할 때만 활성화를 허용한다.
5. Insights는 비동기로 수집하며 Meta 지표와 marketvali의 랜딩 응답 지표를 분리한다.
6. 안전 한도를 넘으면 자동 일시중지는 허용하지만 자동 재시작과 무인 예산 증액은 허용하지 않는다.

외부 연동은 server-only `MetaAdsProvider` 인터페이스 뒤에 둔다. P0에서는 mock provider를 사용한다. P1 구현 시 공식 SDK 또는 얇은 Graph API adapter 중 하나를 버전 고정해 선택한다.

SDK를 사용할 경우 전역 default API, debug token logging과 crash reporting 동작을 피하고 요청마다 명시적인 API instance를 주입한다. MCP, n8n, Make, Zapier를 사용하더라도 같은 provider와 승인 경계를 통과해야 하며 Meta 권한이나 결제 절차를 우회하는 수단으로 취급하지 않는다.

## 보안과 일관성 불변조건

- access token은 서버에서만 암호화 저장하고 브라우저, URL, localStorage와 애플리케이션 로그에 노출하지 않는다.
- OAuth `state`, PKCE, CSRF 방어와 지출 관련 작업의 최근 재인증을 적용한다.
- 모든 쓰기 전에 로그인한 tenant가 선택한 `ad_account_id`를 소유하거나 사용할 권한이 있는지 다시 검증한다.
- 생성과 활성화는 idempotency key와 상태 머신을 사용한다. timeout 뒤 blind retry로 중복 광고를 만들지 않는다.
- 승인 snapshot에는 계정, 통화, 시간대, identity, creative, landing, targeting, lifetime budget과 end time을 포함하고 hash로 쓰기 payload와 결합한다.
- lifetime budget과 end time을 필수로 두고 append-only 감사 로그와 계정·캠페인 kill switch를 제공한다.
- Insights 지연과 attribution 변경을 고려해 backoff와 재동기화를 사용한다.
- UTM에는 불투명한 campaign·creative ID만 넣고 IP, 원문 user-agent와 `fbclid`를 marketvali 분석 데이터로 저장하지 않는다.

## 지표 명칭

- Meta 링크 CTR: `링크 클릭 수 / 노출 수`
- 랜딩 응답률: `선택형 응답 수 / 랜딩 방문 수`
- 긍정 신호율: `positive 응답 수 / 전체 선택형 응답 수`

각 지표는 실제 분모가 수집됐을 때만 표시한다. Insights 수치는 지연되거나 attribution 설정에 따라 바뀔 수 있으므로 실시간 최종값이라고 표현하지 않는다.

## 기각한 대안

### Ads Manager 브라우저 자동화

UI 변경, 2단계 인증, 결제와 정책 화면 때문에 재현성과 보안이 낮다. 실제 계정 쓰기 경로로 사용하지 않는다.

### 처음부터 완전 자동 집행

계정 오선택, 통화·시간대 혼동, 중복 생성과 예상치 못한 지출의 피해가 크고 해커톤 핵심 흐름을 늦춘다.

### MCP나 자동화 도구로 권한 절차 우회

도구는 API 호출을 조율할 뿐 Meta의 권한, App Review, 결제와 광고 정책을 우회하지 못한다.

## 결과

- 해커톤 데모는 실제 공개 랜딩과 관심 응답이라는 통제 가능한 증거에 집중한다.
- 광고 등록 직전 패키지는 P0에 남지만 실제 계정 쓰기와 지출은 분리된다.
- 향후 Meta 연동 코드는 UI와 분리된 provider로 추가할 수 있다.
- 광고 activation, 결제수단 설정, 정책 이의제기와 사업 판단에는 사람이 남는다.

## 공식 근거

- [Meta Marketing API 공식 Postman workspace](https://www.postman.com/meta/facebook-marketing-api/overview)
- [Meta Marketing API authorization](https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization)
- [Meta budgets](https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/budgets)
- [Meta Insights](https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights)
- [Meta Business SDK for Node.js](https://github.com/facebook/facebook-nodejs-business-sdk)
