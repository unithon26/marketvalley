# ADR-0023: 계정 소유 캠페인을 영속 자동 lifecycle로 운영한다

상태: 채택
날짜: 2026-08-26

동시 집행 경계는 ADR-0024가 이 결정의 계정당 단일 live run 부분을 대체한다.

## 맥락

기존 흐름은 브라우저가 AI 생성과 게시를 연속 호출하고, 실패하면 입력 화면으로 돌아갔다. Meta PAUSED 초안 생성·활성화·중지도 최종 리포트의 수동 버튼에 의존했다. 하루가 걸리는 실제 광고 수집에서는 사용자가 브라우저를 닫거나 서버 요청이 끝나는 순간 진행 상태와 후속 작업이 끊기며, 로그인 뒤에도 현재 단계를 복원할 권위 있는 상태가 없었다.

## 결정

`campaigns`를 계정 소유의 영속 상태 머신으로 사용한다.

`SUBMITTED → GENERATING → PREPARING → AWAITING_ACTIVATION → COLLECTING → FINALIZING → COMPLETED`가 정상 경로다. 일시 오류는 원래 단계와 입력을 보존한 `RETRY_WAIT`, 안전하게 계속할 수 없는 오류는 `FAILED`로 기록한다. service role 전용 claim·lease·transition RPC만 lifecycle을 변경하며 브라우저는 입력 접수와 사람의 최종 판단만 쓸 수 있다. AI 문구와 Meta 광고 생성 횟수 제한은 ADR-0025에서 제거했다. 이전 Meta quota 오류 코드는 rolling deploy와 기존 실패 행 복구에만 사용한다.

접수 응답을 먼저 저장한 뒤 worker가 Claude 문구, 공개 랜딩 snapshot, 서버 렌더 카드뉴스 5장, Meta 광고 객체, 실제 활성 상태 확인, Insights snapshot, 최종 리포트를 순서대로 처리한다. 동일 광고 계정에는 `ACTIVATING`, `ACTIVE`, `PAUSING` 실행이 하나만 존재하도록 DB unique index와 실행 전 조회를 함께 사용한다. 자동 활성화는 운영자 UUID, 정확한 광고 계정, 고정 lifetime 예산을 환경변수로 모두 재확인할 때만 열린다.

기존 캠페인은 migration에서 먼저 `ARCHIVED`로 보관하고 실제 `meta_ad_runs`가 있는 행만 현재 상태로 복원한다. 이미 ACTIVE인 실행은 새 광고를 만들지 않고 `COLLECTING`으로 이어받는다.

## 기각한 대안

- 브라우저 장기 polling과 연속 API 호출: 탭 종료, 네트워크 단절, 다음 날 복귀를 견디지 못한다.
- Vercel 요청 하나에서 24시간 대기: 실행 시간 제한과 재배포에 취약하다.
- 최종 화면의 수동 Meta 버튼 유지: 사용자가 다시 와서 눌러야 하므로 제거하려는 인계·확인 업무가 남고 중복 집행 위험이 있다.
- 상태를 Meta 이름이나 메모리로만 추론: 계정별 복원, 재시도, 알림의 단일 진실 공급원이 되지 못한다.
- 기존 모든 캠페인을 자동 처리 대상으로 backfill: 발표용 snapshot까지 실제 광고로 전환될 수 있어 안전하지 않다.

## 결과

사용자는 접수 뒤 브라우저를 닫아도 되고, 다시 Google 로그인하면 해당 계정의 현재 화면으로 복귀한다. 광고 소재와 다운로드 ZIP은 동일한 서버 PNG를 사용한다. Meta 외부 효과는 중복 방지 기록과 재시도로 복구한다. 상태 이메일은 제품 범위에 포함하지 않는다.

운영에는 1분 worker, `CRON_SECRET`, Meta 자동 활성화의 정확한 승인값이 필요하다. rollback은 DB migration과 호환되는 application release로만 수행한다.
