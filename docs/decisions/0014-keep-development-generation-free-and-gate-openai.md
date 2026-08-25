# ADR-0014: 개발 문구 생성은 무과금 fixture로 유지하고 OpenAI를 명시적으로 활성화한다

상태: 채택

기준일: 2026-08-25

## 배경

문구 생성용 OpenAI API 모델은 토큰 사용량에 따라 과금되며 무료 rate limit을 제공하지 않는다. 개발 환경에 API 키가 있다는 이유만으로 live adapter가 선택되면 로컬 실행과 테스트에서 의도하지 않은 비용이 발생할 수 있다. 반면 실제 적용 직전에는 랜딩, 캐러셀과 게시 문구를 같은 `CampaignSpec`으로 생성하는 경로가 완성돼 있어야 한다.

## 결정

- `CAMPAIGN_GENERATOR_MODE`의 기본값은 `fixture`다. `OPENAI_API_KEY`가 있어도 모드를 명시적으로 `openai`로 바꾸기 전에는 외부 요청을 보내지 않는다.
- fixture는 기존 `FixtureCampaignGenerator`를 사용하므로 개발, 자동 테스트와 발표 흐름의 생성 비용은 0원이다.
- 개발·발표에서는 이미지 모델도 사용하지 않고 검증된 reference 자산과 결정적 React/CSS renderer를 유지한다.
- live 기본 모델 후보는 Responses API와 Structured Outputs를 지원하는 `gpt-4o-mini`다. 무료 모델이라는 의미가 아니며, `openai` 모드로 전환한 시점부터 실제 사용량이 과금된다. 모델은 서버 전용 `OPENAI_TEXT_MODEL`로 교체할 수 있다.
- OpenAI adapter는 슬롯별 developer prompt와 사용자 입력 JSON을 한 번의 Responses API 요청으로 전달하고 `store: false`, 20초 timeout, SDK 재시도 1회, 빈 구조화 응답 재시도 1회로 제한한다.
- strict Structured Outputs가 Zod tuple을 지원하지 않으므로 OpenAI 전용 스키마에서는 같은 길이의 배열로 표현한다. 응답은 기존 `CampaignSpec`으로 다시 검증해 tuple, 길이와 중복 규칙을 유지한다.
- 모델이 반환한 `generation`, 언어, 판단 기준, signal option 순서, Figma 색상과 시각 방향은 신뢰하지 않고 서버 값으로 덮어쓴다.
- 설정 오류와 upstream 실패는 비밀정보를 포함하지 않는 503으로 반환한다. 실패를 fixture 성공으로 위장하지 않으며, 발표·개발에서 외부 의존성을 제거하려면 모드를 `fixture`로 유지한다.

## 기각한 대안

### 기존 `gpt-5.6-terra`를 개발 기본값으로 둔다

문구 품질은 기대할 수 있지만 모든 개발 호출이 과금되고 사용자의 무과금 개발 요구와 맞지 않아 기각했다.

### OpenAI 모델을 무료 모델이라고 표시한다

공식 모델 문서에서 문구 생성 모델의 무료 API 사용을 보장하지 않으므로 사실과 다른 설정이 된다. 대신 외부 호출 자체가 없는 fixture를 무과금 개발 모드로 사용한다.

### API 키가 있으면 자동으로 live adapter를 선택한다

키 존재는 비용 발생 승인과 같지 않다. 자동 테스트, 로컬 실행이나 발표 중 예상치 못한 요청을 만들 수 있어 기각했다.

### OpenAI 장애를 조용히 fixture 결과로 바꾼다

실제 AI 생성이 성공한 것처럼 보일 수 있어 기각했다. live 실패는 명시적으로 알리고, 비용과 외부 의존성을 없애려는 개발·발표 환경만 사전에 fixture로 선택한다.

## 결과

현재 제품 화면과 `/api/generate`는 fixture 결과를 유지한다. OpenAI adapter, strict schema 변환, 서버 소유 필드 정규화와 오류 경계는 구현돼 있으며, 실제 적용은 서버 환경의 `CAMPAIGN_GENERATOR_MODE=openai` 전환과 대표 입력 품질 검증 이후에만 수행한다. 이번 작업에서는 실제 OpenAI 요청을 보내지 않는다.

## 근거

- [OpenAI GPT-4o mini 모델](https://developers.openai.com/api/docs/models/gpt-4o-mini): Responses API와 Structured Outputs 지원, 토큰 가격과 Free tier 미지원
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responses API의 `text.format`과 Zod 기반 parse 계약
