# ADR-0017: 제품 문구 생성은 Claude Haiku 4.5를 사용한다

상태: ADR-0020으로 대체

기준일: 2026-08-25

## 배경

제품 문구 생성 공급자를 OpenAI에서 Anthropic으로 교체하기로 결정했다. Anthropic Claude API에는
무료 모델이 없으며, 현재 활성 Claude 모델 가운데 가장 저렴한 모델은 Claude Haiku 4.5다. 더
저렴했던 Claude Haiku 3과 3.5는 이미 종료돼 신규 호출에 사용할 수 없다.

## 결정

- 제품 기본 생성 모드는 `anthropic`, 모델은 snapshot ID
  `claude-haiku-4-5-20251001`로 고정한다.
- `AnthropicCampaignGenerator`는 Messages API의 `output_config.format` Structured Outputs를
  사용해 한 번에 평면 문구 슬롯과 허용된 선택자를 만든다. 서버가 고정 필드를 조립하고 기존
  `CampaignSpec` Zod 계약으로 다시 검증한다.
- signal option label은 문법 복잡도를 키우는 개별 필드 대신 positive·neutral·negative 순서의
  길이 3 배열로 출력하고 서버가 같은 순서의 고정 ID를 결합한다.
- live timeout은 60초, SDK와 앱 자동 재시도는 0회로 둔다. timeout이나 빈 응답 뒤에는 사용자가
  명시적으로 다시 시도하게 해 중복 생성과 과금 가능성을 줄인다.
- 서버 비밀은 `ANTHROPIC_API_KEY`, 모델 override는 `ANTHROPIC_TEXT_MODEL`로만 받는다.
- 기존 OpenAI SDK, adapter, 환경변수와 `openai` 생성 모드는 제거한다.
- 인증, same-origin, 분산 quota, 서버 소유 필드 덮어쓰기와 명시적 `fixture` fallback은 유지한다.
- Anthropic의 `billing_error`는 일반 생성 실패와 구분하되 상세 upstream 메시지는 응답에 노출하지
  않는다.

## 기각한 대안

### 종료된 Claude Haiku 3 또는 3.5를 사용한다

단가는 더 낮았지만 Claude API에서 이미 종료돼 요청이 실패하므로 기각했다.

### OpenAI와 Anthropic을 함께 지원한다

현재 제품은 공급자 선택 UI가 필요하지 않다. SDK, 환경변수, 오류 경계와 테스트를 두 벌로 유지할
이유가 없어 단일 Anthropic 경로를 선택했다.

### fixture를 제품 기본값으로 사용한다

호출 비용은 없지만 실제 AI 문구 생성이라는 제품 동작과 달라 테스트·비상 발표 fallback으로만
유지한다.

## 결과

제품의 live 문구 생성은 Claude Haiku 4.5 하나로 수렴한다. 전체 `CampaignSpec`을 그대로 출력
스키마로 사용했을 때 Anthropic의 내부 문법 복잡도 제한을 넘는 것을 실제 400 응답으로 확인했다.
문구 계약을 평면화하고 서버 소유 필드를 출력에서 제외한 뒤 실제 요청이 최종 `CampaignSpec`
검증까지 통과했다. 배열을 개별 signal label 필드로 펼치면 다시 한도를 넘는 후속 회귀도 확인해
`campaign-spec-v2-reservations-flat-v2`의 작은 배열 계약과 크기 회귀 검사를 고정했다. API 호출은
토큰 사용량에 따라 과금되며, 자동 테스트와 발표 복구는 계속 외부 호출이 없는 fixture를 사용한다.

## 근거

- [Anthropic 모델 목록](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic 가격](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic 모델 종료 정책](https://platform.claude.com/docs/en/about-claude/model-deprecations)
