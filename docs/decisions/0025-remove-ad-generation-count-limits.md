# ADR-0025: 광고 생성 횟수 제한을 두지 않는다

상태: 채택
날짜: 2026-08-26

## 맥락

AI 문구 생성에는 분당 3회, 사용자별 일일 30회, 서비스 전체 일일 300회의 내부 quota가 있었고, Meta 광고 객체 생성에는 사용자별 일일 2회, 서비스 전체 일일 50회의 내부 operation quota가 있었다. 실제 연속 접수에서 Claude 문구 생성과 광고 소재 준비를 통과한 캠페인이 Meta 한도 때문에 중단됐고, 일반 transient 오류 backoff를 소진해 `FAILED`가 됐다. 최신 운영 요구는 AI 문구 생성과 Meta 광고 등록 모두 사용자별·전체 횟수를 제한하지 않는 것이다.

## 결정

애플리케이션의 AI 문구 생성 quota 호출과 분당·일일 설정, 상태 점검을 제거한다. 이전 worker가 rolling deploy 중 `consume_generation_quota`를 호출해도 중단되지 않도록 기존 시그니처는 항상 `true`를 반환하는 호환 RPC로 교체한다. 과거 quota 테이블은 삭제하지 않지만 현재 경로와 호환 RPC 모두 읽거나 갱신하지 않는다.

신규 Meta operation의 사용자별·전체 일일 count 검사, counter 증가와 quota 거절도 모두 제거한다. 환경변수, 서버 policy, ledger RPC client와 배포 preflight에서 두 count 값을 제거한다. 기존 8인자 `acquire_meta_ad_operation`의 마지막 두 인자는 rolling deploy와 rollback 호환을 위해 optional no-op으로 유지하며 새 client는 전달하지 않는다.

operation key·fingerprint 충돌 검사, owner/campaign 소유권, advisory lock, renewable lease, 단계별 checkpoint와 reconciliation은 그대로 유지한다. 따라서 생성 횟수는 제한하지 않지만 같은 캠페인의 재시도가 Meta 객체를 중복 생성하지는 않는다. 과거 daily usage 테이블은 이번 migration에서 삭제하지 않고 더 이상 읽거나 갱신하지 않는다.

배포 preflight는 service-role 전용 marker RPC가 실제로 `true`를 반환하는지 확인해 구 DB 함수가 남은 release를 차단한다. 공유 migration은 과거 캠페인 상태를 일괄 변경하지 않는다. 기존 quota 오류로 멈춘 정확한 캠페인은 owner, 상태·오류 코드, 만료된 처리 lease, materialized spec, operation·run 없음이 모두 확인된 경우에만 별도 운영 작업으로 재개한다. 외부 객체 생성 전 실패였으므로 임시 수집 일정을 비우고 worker가 전체 구간을 새로 계산하게 한다.

## 기각한 대안

- AI 또는 Meta 한도를 큰 값으로 상향: 여전히 횟수 제한이 남아 최신 요구와 다르다.
- 사용자 한도를 전체 한도와 동일하게 설정: 전체 일일 차단선이 남는다.
- 큰 sentinel 숫자 사용: 실제 무제한이 아니며 설정값과 DB 검증이 계속 제품 동작을 좌우한다.
- operation ledger 제거: 횟수 제한과 중복 방지는 별개다. 외부 객체의 idempotency와 crash reconciliation을 잃으므로 기각한다.

## 결과

한 계정 또는 서비스 전체에서 만들 수 있는 AI 문구와 Meta 광고 수에는 애플리케이션 count 상한이 없다. 캠페인별 실행, 계정·운영자 승인과 외부 상태 안전성은 기존 계약을 따른다. aggregate 사용량 counter가 더 이상 갱신되지 않으므로 광고 수 관측은 campaign과 operation 레코드에서 수행한다. 공개 예약 폼의 중복·자동화 남용 방지는 광고 생성 횟수와 다른 경계이므로 유지한다.
