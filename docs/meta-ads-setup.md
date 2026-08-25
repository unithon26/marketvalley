# Meta PAUSED 광고 초안 설정

상태: 구현, 회사 자산 최소 권한과 System User 앱 테스트 역할 할당, 5개 권한 60일 token 발급·읽기 검증 완료. migration·production 쓰기 검증 전

이 문서는 회사 소유 Meta 자산에 `PAUSED` 광고 초안만 생성하는 선택적 P1 연동을 다룬다. 일반 사용자는 랜딩과 PNG·ZIP을 만들 수 있지만, Meta 계정 쓰기는 서버 환경변수에 등록된 회사 내부 운영자만 실행한다. `ACTIVE` 전환, 결제수단 관리와 실제 지출은 이 연동의 책임이 아니다.

## 0. 2026-08-25 확인 상태

- Business Portfolio: `Marketvalley` (`1039774862101186`)
- Facebook Page: `Marketvalley` (`1184819474725303`)
- Instagram professional account: `marketvalley__` (`17841438643564582`)
- 개발자 앱: `MarketValley Ads Publisher` (`1437415924870020`), Marketing API의 `ads_management`·`ads_read`와 Page 광고·조회에 필요한 `pages_manage_ads`·`pages_read_engagement`·`pages_show_list`가 테스트 준비 완료
- Employee System User: `Marketvalley Publisher` (`61593548470446`)
- System User 자산 권한: Page 광고·인사이트, Instagram 광고·인사이트, 광고 계정 캠페인 관리·성과 보기·Creative Hub 모의 광고 관리. Meta가 선택한 최소 광고 권한의 종속 권한을 함께 표시한 결과다.
- System User 앱 역할: `MarketValley Ads Publisher`의 부분 접근 `앱 테스트`. 앱 개발·인사이트·앱 관리 역할은 부여하지 않았다.
- 광고 계정: `marketvalley` (`1026341707121609`). Business Settings URL의 `23859318575880798`은 내부 자산 식별자이므로 Graph API와 환경변수에는 사용하지 않는다.
- 앱의 App Secret Proof 요구 설정은 켰다.
- 2026-08-26에 위 5개 권한을 가진 60일 System User token을 새로 발급해 macOS Keychain에 저장했다. 값은 저장소·문서·채팅에 기록하지 않았다. 기존 2개 권한 token은 유출 정황이 없어 전체 token 취소로 새 token까지 폐기하지 않고 미사용 상태로 만료시킨다.
- 운영 Graph API에서 광고 계정 통화 `KRW`, 시간대 `Asia/Seoul`, 활성 상태와 비활성 사유 없음까지 확인했다.
- 새 token으로 광고 계정의 System User 광고 관리 task, 지정 Page, Page→Instagram 쌍과 광고 계정의 Instagram identity를 직접 확인했다. `promote_pages`는 빈 목록이어서 운영 검증 계약에서 사용하지 않는다.
- 결제수단, `ACTIVE`, 실제 광고 객체, 지출은 만들지 않았다.

## 1. 회사 자산 만들기

1. 개인 실명 Facebook 관리자 계정에서 2단계 인증을 켠다. 공유용 가짜 개인 계정을 만들지 않는다.
2. Meta Business Suite에서 회사 이름과 회사 이메일로 Business Portfolio를 만들고 이메일을 확인한다.
3. 회사 소유 Facebook Page를 Portfolio에 만들거나 가져온다.
4. 회사 Instagram 계정을 Professional의 Business 유형으로 전환하고 Page와 연결한 뒤 Portfolio에 추가한다.
5. Portfolio 소유 광고 계정을 만든다. 통화는 `KRW`, 시간대는 `Asia/Seoul`로 확정한다. 생성 뒤 변경하기 어려울 수 있으므로 저장 전 다시 확인한다.
6. 최소 한 명의 보조 관리자를 추가하고 양쪽 관리자 모두 2단계 인증을 켠다.

아래 비밀이 아닌 식별자만 별도 운영 기록에 남긴다.

- Business Portfolio ID
- Ad Account ID (`act_` 접두사 제외 숫자)
- Facebook Page ID
- Instagram professional account ID와 username

## 2. 개발자 앱과 System User

1. Meta for Developers에서 회사 관리용 앱을 만들고 Business Portfolio에 연결한다.
2. Marketing API 제품 또는 use case를 추가한다.
3. Business settings의 `Users > System users`에서 `Marketvalley Publisher`를 직원 권한으로 만든다.
4. System User에 광고 계정의 캠페인 관리, Page의 광고 만들기, 연결된 Instagram 계정의 광고 사용 권한만 할당한다.
5. 앱에 System User를 `앱 테스트` 최소 역할로 할당하고 60일 token을 만들어 `ads_management`, `ads_read`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`만 부여한다.
6. 토큰 만료 시각, 회전 담당자와 다음 회전일을 운영 기록에 남긴다.

`instagram_content_publish`, `business_management`, `instagram_basic`은 현재 유료 광고 초안 경로에 추가하지 않는다. 게시물 발행이나 Business 자산 관리가 아니라 고정 Page identity를 사용하는 광고 초안 생성만 수행한다.

## 3. Page와 Instagram 연결 확인

Production System User token으로 아래 조회를 실행한다.

```http
GET /<PAGE_ID>?fields=id,instagram_business_account{id}
```

응답의 Page ID와 Instagram ID가 설정하려는 쌍과 일치하면 쌍과 UTC 확인 시각만 기록한다. 이어서 다음 자산 접근을 확인한다.

```http
GET /act_<AD_ACCOUNT_ID>/assigned_users?fields=id,user_type,permitted_tasks&business=<BUSINESS_ID>
GET /act_<AD_ACCOUNT_ID>/instagram_accounts
```

첫 응답에서 System User와 `MANAGE`·`ADVERTISE` task가, Page 직접 조회에서 지정 Page→Instagram 쌍이, 마지막 응답에서 같은 Instagram ID가 보여야 한다. `promote_pages`는 System User token에서 빈 목록일 수 있어 고정 Page의 권한과 연결을 증명하는 운영 조건으로 사용하지 않는다. 응답 원문과 token은 저장소·채팅·화면 녹화에 남기지 않는다.

## 4. Production 환경변수

초기 배포는 반드시 `META_ADS_MODE=disabled`로 한다. 비밀값은 Oracle 호스트의 권한 `0600` production 환경 파일에만 넣는다.

```dotenv
META_ADS_MODE=disabled
META_OPERATION_LEDGER_MODE=supabase
META_DRAFT_OPERATOR_USER_IDS=<INTERNAL_SUPABASE_USER_UUID>
META_AD_ACCOUNT_ID=<DIGITS_WITHOUT_ACT_PREFIX>
META_PAGE_ID=<PAGE_ID>
META_INSTAGRAM_ACTOR_ID=<INSTAGRAM_ID>
META_VERIFIED_PAGE_INSTAGRAM_BINDING=<PAGE_ID>:<INSTAGRAM_ID>
META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT=<CANONICAL_UTC_ISO_TIMESTAMP>
META_ALLOWED_DESTINATION_ORIGIN=https://<PRODUCTION_DOMAIN>
META_MAX_LIFETIME_BUDGET_MINOR=<SERVER_HARD_CAP>
META_DRAFT_LIFETIME_BUDGET_MINOR=<PAUSED_DRAFT_BUDGET>
META_DRAFT_DAILY_OWNER_LIMIT=2
META_DRAFT_DAILY_GLOBAL_LIMIT=50
META_DRAFT_LEAD_MINUTES=10
META_DRAFT_DURATION_HOURS=24
META_ACCESS_TOKEN=<SYSTEM_USER_SECRET>
META_APP_SECRET=<APP_SECRET>
```

KRW 광고 계정에서는 budget 숫자를 원 단위로 취급하는지 실제 계정의 API·Ads Manager 표시를 `PAUSED` 검증에서 대조한다. 값의 단위를 확인하기 전에는 `live`를 켜지 않는다. 시작 여유는 5분~24시간, 집행 구간은 1~72시간 범위에서만 설정한다.
서버는 요청 시각을 분 단위로 올림한 뒤 `META_DRAFT_LEAD_MINUTES`만큼 뒤에 시작하고 `META_DRAFT_DURATION_HOURS` 뒤에 끝나는 일정을 계산한다. 따라서 오래 실행한 배포가 고정 timestamp 만료 때문에 비활성화되지 않는다. 광고 destination은 요청을 처리한 호스트가 아니라 `META_ALLOWED_DESTINATION_ORIGIN`의 공개 랜딩으로 고정한다.

## 5. 활성화 순서

1. migration `202608250003_meta_paused_draft_operations.sql`을 staging Supabase에 적용한다.
2. RPC 권한, owner mismatch, quota, lease 경쟁, rollback과 reconciliation을 실제 PostgreSQL에서 검증한다.
3. Oracle proxy가 단일 authoritative `Content-Length`를 보존하고 제한 초과 요청을 앱 버퍼링 전에 거절하는지 검증한다.
4. 서버에서 Graph v26 자산 조회를 실행해 Page와 Instagram 접근을 확인한다.
5. `META_ADS_MODE=live`로 바꾸고 내부 운영자 한 명의 캠페인으로 한 번만 실행한다.
6. Ads Manager에서 campaign, ad set, creative와 ad가 모두 `PAUSED`인지 확인한다. 실제 노출과 지출이 0인지 확인한다.
7. 같은 요청을 다시 실행해 새 객체가 중복 생성되지 않는지 확인한다.
8. 불확실한 외부 응답을 만든 테스트에서는 자동 재시도하지 않고 reconciliation 기록으로 전환되는지 확인한다.
9. 검증 객체를 정리하고 운영 결과를 `WORKLOG.md`와 troubleshooting 기록에 남긴다.

실제 migration, 계정 쓰기, 배포 설정 변경은 production 변경이므로 실행 직전에 사용자의 명시적 승인을 받는다.

## 공식 자료

- [Meta Business Suite](https://business.facebook.com/)
- [Meta 앱 대시보드](https://developers.facebook.com/apps/)
- [Marketing API 시작하기](https://developers.facebook.com/docs/marketing-apis/get-started)
- [Marketing API 인증](https://developers.facebook.com/docs/marketing-api/overview/authorization/)
- [Meta 공식 Marketing API Postman](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi)
- [Meta 공식 온보딩 Postman](https://www.postman.com/meta/facebook-marketing-api/documentation/9jo4f5y/mapi-onboarding)
- [Page Graph API](https://developers.facebook.com/docs/graph-api/reference/page/)
- [ads_management 권한](https://developers.facebook.com/docs/permissions/reference/ads_management/)
