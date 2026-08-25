# ADR-0015: 제품 문구 생성은 OpenAI를 기본으로 사용한다

상태: 채택

기준일: 2026-08-25

## 배경

랜딩페이지 제작에서 문구를 AI가 만들기로 했지만 기존 설정은 `CAMPAIGN_GENERATOR_MODE=fixture`를 기본으로 사용했다. OpenAI adapter와 랜딩 문구 슬롯이 구현돼 있어도 실제 `/api/generate`는 결정적 fixture를 반환했고, 입력 화면도 목데이터라고 고정 표시했다. 제품 의도와 실행 결과가 달랐다.

## 결정

- 설정이 없을 때 제품 생성 경로는 `openai`다. `OPENAI_API_KEY`가 없으면 fixture로 조용히 대체하지 않고 준비되지 않은 상태와 503 오류를 반환한다.
- OpenAI는 Responses API Structured Outputs 한 번으로 `CampaignSpec` 전체를 생성한다. 랜딩 Hero, 문제, 혜택, 작동 단계와 FAQ 문구도 같은 응답에 포함한다.
- 입력 화면은 요청 시점의 서버 환경에서 `openai`와 `fixture`를 구분해 표시한다. OpenAI 키가 없으면 생성 버튼을 비활성화한다.
- OpenAI 생성 endpoint는 JSON Content-Type과 same-origin을 검사하고 Google `getClaims()`로 검증된 사용자만 호출한다. 단일 서버 프로세스에서 사용자별 분당 3회로 제한하며, Supabase 전환 때 분산 제한으로 교체한다.
- 자동 테스트와 외부 장애 시 발표 fallback은 `CAMPAIGN_GENERATOR_MODE=fixture`를 명시한다. fixture 결과를 AI 생성으로 표현하지 않는다.
- OpenAI 호출은 노출 이력 없는 회전된 서버 키와 비용 승인 뒤에만 수행한다. 모델 출력은 기존 Zod 계약으로 검증하고 서버 소유 필드는 계속 덮어쓴다.

## 기각한 대안

### fixture를 계속 기본값으로 둔다

비용과 발표 안정성에는 유리하지만 제품의 핵심인 AI 문구 생성이 설정 누락만으로 사라지고 화면에서도 실제 동작을 오인하게 하므로 기각했다.

### 키가 없으면 fixture로 자동 전환한다

사용자에게 AI 생성이 성공한 것처럼 보일 수 있어 기각했다. fallback은 실행 전에 명시적으로 선택한다.

## 결과

제품과 테스트의 생성 모드가 분리된다. 실제 제품은 인증·출처·호출량 경계 안에서 OpenAI 문구를 랜딩·캐러셀·게시 준비 파일에 함께 반영하고, 테스트와 비상 발표는 비용 없이 같은 계약과 렌더러를 검증한다. 실제 품질 평가는 회전된 키로 대표 입력을 호출한 뒤 별도로 완료한다.
