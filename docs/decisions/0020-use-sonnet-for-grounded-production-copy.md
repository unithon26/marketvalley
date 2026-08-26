# ADR-0020: 운영 문구 생성은 Claude Sonnet 4.6을 사용한다

상태: 채택

기준일: 2026-08-25

## 배경

Claude Haiku 4.5는 평면 Structured Outputs 계약과 형식 검증에는 안정적으로 응답했지만, 대표 입력 품질 평가에서 입력에 없는 가격·할인·구체 채널·환불 절차를 보완하거나 문제의 원인과 효과를 만들어냈다. prompt를 좁히고 서버가 임의 검증 임계값, 금지 주장, 해시태그와 구체 채널을 정규화해도 대상·일정·준비물 같은 입력 항목을 난이도·요일·사전 설치로 확장하는 경향이 남았다.

같은 `campaign-spec-v2-reservations-flat-v9` 계약을 Claude Sonnet 4.6에 적용한 실제 주입·미확인 주장 사례는 입력 항목을 그대로 나누고, 금지 수치를 공개 문구에서 격리하며, 사람이 예약자명단을 보고 개설 여부를 판단하는 역할을 유지했다. 호출은 약 52초가 걸려 기존 60초 제한의 여유가 작았다.

## 결정

- 운영 기본 모델은 Anthropic이 현재 안내하는 `claude-sonnet-4-6`으로 둔다.
- `temperature`는 0, SDK와 앱 자동 재시도는 0회로 유지한다.
- timeout은 대표 입력 실측을 반영해 90초로 늘린다. timeout 뒤 자동 재호출하지 않아 중복 과금을 막는다.
- 모델 출력은 그대로 게시하지 않는다. 서버가 검증 중단 문장, hashtag 형식, 입력에 없는 채널과 금지 주장 기록을 정규화하고, 미확인 수치·성과와 입력에 없는 운영 세부사항은 fail-closed로 거절한다.
- 자동 테스트와 비상 발표는 계속 외부 호출 없는 fixture를 사용한다.
- 애플리케이션 생성 횟수 quota는 ADR-0025에서 제거했다. Anthropic 계정의 외부 결제·사용 한도는 애플리케이션 count 제한으로 취급하지 않는다.

## 기각한 대안

### Claude Haiku 4.5를 운영 기본값으로 유지한다

입출력 단가는 Sonnet의 약 3분의 1이고 응답도 더 빨랐지만, 반복된 대표 입력에서 공개하기 어려운 세부 발명이 확인됐다. 시장검증 문구의 사실성은 호출 단가보다 우선하므로 발표 fallback이 아닌 운영 기본값에서는 기각했다.

### Haiku 출력이 실패하면 Sonnet으로 자동 재시도한다

한 사용자 요청이 두 번 과금되고 지연과 failure mode가 늘어난다. 하나의 품질 모델과 명시적 사용자 재시도 경계가 더 설명 가능하므로 기각했다.

### 모델 출력 뒤 두 번째 LLM 검수 호출을 추가한다

검수 모델도 같은 종류의 오류를 만들 수 있고 비용·지연·운영 계약이 두 배가 된다. 결정적 서버 검증과 대표 입력 eval을 우선한다.

## 결과와 위험

공식 기본 단가는 Sonnet 4.6이 입력 $3/MTok·출력 $15/MTok, Haiku 4.5가 입력 $1/MTok·출력 $5/MTok이다. 실제 비용은 입력 길이와 출력 토큰에 따라 달라지며 측정하지 않은 호출당 비용을 문서에 고정하지 않는다. 월 spend limit에 도달하면 생성이 실패하므로 UI는 실패를 성공처럼 보이지 않고 fixture로 자동 전환하지 않는다.

최종 prompt와 Sonnet으로 실행한 주입·공방 빈자리·마감 음식 대표 입력 세 종은 각각 약 52.0초, 55.8초, 56.8초에 완료됐다. 공개 문구의 금지 세부사항, hashtag 형식, 주입 문구 격리, 숫자 근거와 사람의 판단 역할에 대한 자동 검사를 모두 통과했고 입력 근거와 문장 자연스러움을 수동 검토했다. 이 결과는 모델의 일반 정확도 측정이 아니라 운영 전 대표 사례 회귀 근거로만 사용한다.

## 근거

- [Anthropic 모델 목록](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic 가격](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
