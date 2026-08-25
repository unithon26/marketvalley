# 작업 기록 (개발자 A)

## 2026-08-25 — 로컬 QA 완료 후 남은 개발 항목 의존성 분리와 예약자명단 전환 설계

- 목적: 로컬 QA를 마친 뒤, 개발자 A(Claude Code)와 개발자 B(Codex)가 각자 세션에서 충돌 없이 작업을 시작할 수 있도록 남은 항목(OAuth, AI 마이그레이션, 이메일 DB 저장, 서버 배포, Meta 연결)을 의존성 기준으로 정리
- 변경: 리포트 지표 레퍼런스(`proo-landing.vercel.app`)를 검토하는 과정에서, 기존 긍정·중립·부정 익명 신호를 이름+이메일 예약자명단으로 바꾸는 방향이 `docs/decisions/0001-close-the-validation-loop.md`·`docs/validation.md`의 "개인정보 비수집" 원칙 및 `WORKLOG.md`에 기록된 개발자 B의 기존 반려 결정과 충돌함을 발견. 사용자에게 직접 확인 후 의도적 전환으로 확정하고 `docs/decisions/0013-switch-anonymous-signal-to-named-reservation.md`(ADR-0013)를 새로 작성. `docs/spec.md`(P0-4, 지표 정의, Supabase 스키마 스케치)와 `docs/validation.md`(안전성과 진실성)를 ADR-0013 기준으로 갱신. 상세 데이터 계약·화면 변경 범위·작업 순서·A/B 분담을 `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md`에 기록
- 영향 범위: `docs/decisions/0013-switch-anonymous-signal-to-named-reservation.md`, `docs/spec.md`, `docs/validation.md`, `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md`, `WORKLOG_A.md`, `TROUBLESHOOTING_A.md`. 제품 코드(`app/`, `components/`, `lib/`)는 이번 세션에서 변경하지 않음
- 결정: 계정/OAuth는 이번 스코프에서 버튼(표시)만 만들고 실제 로그인 연결과 캠페인 소유권 격리는 보류. 결제·입금 연동은 완전히 스코프 제외. 리포트는 예약자 수·리스트만 실제 데이터로 두고 노출수·CTR·체류시간·이탈률·예약률은 "예시 지표" 라벨을 붙인 목업 값으로 유지. 작업 순서는 `[0] 계약 확정` → `B-1(Supabase)`/`B-2(OpenAI)` 병렬 → `A-1(화면)` → 서버 배포(B-1/B-2 직후) 순, OAuth 버튼은 아무 때나 병행 가능, Meta 실연동은 이번 스코프 제외
- 검증: 문서 전용 변경이라 `pnpm check`는 실행하지 않음. `docs/superpowers/specs/2026-08-24-figma-alignment-and-dependency-split-design.md`를 대조해, 디자이너 원본 Figma 리포트 화면도 원래 노출수·CTR·예약률·이메일 리스트 구성이었고 어제 감사에서 개인정보 비수집 원칙 때문에 의도적으로 이탈했던 것임을 확인 — 이번 전환이 그 Figma 원안으로 되돌아가는 결정이라는 근거를 ADR-0013와 마이그레이션 설계 문서에 남김
- 전달: 로컬 문서 변경만 완료. 커밋·push는 사용자 요청에 따라 이 기록과 함께 진행 예정
- 남은 일: 개발자 B가 `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md` §1의 계약으로 `lib/contracts/repository.ts`·`lib/demo/fixtureRepository.ts` 스텁을 먼저 커밋해야 A-1(화면)이 시작 가능. `tests/e2e/demo-flow.spec.ts`는 새 예약자명단 흐름 기준으로 전면 재작성 필요
