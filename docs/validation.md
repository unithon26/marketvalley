# 검증 체크리스트

상태: 발표용 fixture 종단 QA 완료

다음 명령으로 정적 검사, 단위 테스트, production build와 핵심 브라우저 흐름을 확인한다.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

2026-08-25에 입력 개인화와 Figma 산출물 템플릿을 반영한 뒤 `pnpm check`, `pnpm build`, `pnpm test:e2e`, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`가 모두 성공했다. 단위 테스트는 5개 파일 33개, production `next start`를 사용하는 Chromium E2E는 13개다. 단위 테스트 커버리지는 statements 87.96%, branches 77.55%, functions 94.31%, lines 89.27%였고 알려진 취약점과 peer dependency 문제는 없었다.

같은 날 Figma 고정 영역과 AI 문구 슬롯의 프롬프트 계약을 추가한 뒤 `pnpm check`, `pnpm build`, `pnpm test:coverage`, `pnpm audit --audit-level high`, `pnpm peers check`, `git diff --check`가 성공했다. 단위 테스트는 6개 파일 38개이고 커버리지는 statements 88.35%, branches 77.55%, functions 94.62%, lines 89.66%다. 새 테스트는 고정·생성 소유권, 슬롯별 지시 누락, 후킹 3종의 역할·과장 금지, 사용자 입력의 명령 격리와 prompt version을 검증한다. 화면과 API 동작을 바꾸지 않아 기존 production E2E 13개 결과는 재사용하고 새 E2E는 추가하지 않았다.

E2E는 2단계 입력과 생성·게시, 입력한 상품명·특징의 리포트·공개 랜딩·캐러셀·Meta 파일 반영, 약 2초의 진행 완료, 문구 4종 clipboard 복사, 캐러셀·Meta ZIP 내부 항목과 PNG 5장의 1080×1350 크기, 사진형 표지 자산 포함, 절대 destination URL, 공개 응답·중복 방지, 무응답 비율, 사전 기준 gap, 사람 판단 저장·초기화, API 입력·크기·소유권·404 경계, 요청 실패와 게시 응답 유실 재시도, 광고 격리, 3개 fixture의 slug·SEO·브랜드, Figma 표지 3종·랜딩 도입부 7종, 계약상 최대 길이의 표지 잘림·랜딩 겹침 방지, 375px overflow·키보드·ARIA, polling 순서 경쟁과 3초 이상 지연되는 조회의 중복 방지를 재현한다. 홈·진행·결과 화면에는 내부 용어 `캠페인`과 `CampaignSpec`이 노출되지 않는지도 확인한다.

## 자동 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

- `lint`, `typecheck`, 단위 테스트와 production build가 오류 없이 끝난다.
- Playwright가 매번 새 production build를 전용 3100 포트의 `next start`로 실행하고, 기존 개발 서버를 재사용하지 않은 채 외부 키와 네트워크 없이 핵심 수동 흐름을 재현한다.
- E2E는 개발 회귀 검증에만 사용하며 발표 자동 재생이나 자동 클릭 기능으로 제공하지 않는다.

## 핵심 기능

- 예시 입력에서 하나의 유효한 `CampaignSpec`이 생성된다.
- 솔루션에 적은 상품명과 특징 세 개가 고정 fixture 문구로 대체되지 않고 같은 `CampaignSpec`의 랜딩, 카드뉴스와 게시 문구에 반영된다.
- 2단계 입력이 완료되기 전에는 공개 URL과 다운로드 파일이 생성되지 않는다.
- `광고 만들기` 뒤 같은 `CampaignSpec`에서 공개 랜딩과 캐러셀 파일이 생성된다.
- `/p/demo`에서 선택형 응답 한 건을 제출할 수 있다.
- 같은 브라우저의 두 번째 응답은 거절된다.
- 응답·판단·초기화 API 실패는 성공으로 표시되지 않으며 재시도할 수 있다.
- 응답 분포와 사전 판단 기준이 사실대로 표시된다.
- 사람이 선택한 다음 행동이 새로고침 뒤에도 유지된다.
- 1080×1350 PNG 5장을 정렬된 파일명의 캐러셀 ZIP으로 내려받을 수 있다.
- `Meta 게시 준비` ZIP에는 같은 PNG 5장과 문구·절대 destination URL이 들어 있고 실제 등록 완료로 표현되지 않는다.

## 화면과 접근성

- 375px에서 가로 스크롤 없이 핵심 CTA가 보인다.
- 발표 노트북 해상도에서 2단계 입력, 진행과 결과 상태가 구분된다.
- 키보드만으로 입력, 생성, 공개, 응답과 판단을 조작할 수 있다.
- focus 상태, label, 선택 버튼의 `aria-pressed`와 오류 문구가 있다.
- 계약상 허용되는 모든 브랜드 색은 주요 텍스트에 4.5:1 이상의 fallback 대비를 사용하고, reference fixture의 실제 computed style 대비를 E2E로 확인한다.
- 긴 한글 문구가 잘리거나 `undefined`로 보이지 않는다.
- PNG 결과가 1080×1350이고 `01-hook.png`부터 `05-cta.png` 순서다.
- `CampaignSpec`이 Figma 표지 `31`, `32`, `34`와 랜딩 도입부 `1`부터 `7` 이외의 템플릿 ID를 거절한다.
- reference fixture 세 종이 서로 다른 표지·랜딩 도입부를 선택하며 공개 DOM과 ZIP이 그 선택을 유지한다.
- 카드뉴스 2~5장도 첫 장이 선택한 흰 배경형 또는 사진·보라색 강조형 조판을 이어가며 상품명과 특징을 표시한다.

데스크톱 전체 흐름과 375px의 홈·입력·공개 랜딩·결과 화면을 브라우저에서 확인했다. 375px에서 가로 overflow가 없었고 공개 응답 뒤 결과가 4건에서 5건, 긍정 2건에서 3건으로 갱신되는 것을 확인했다. 브라우저 확장이 hydration 전에 `style` 속성을 주입해 개발 모드 경고를 만든 현상은 깨끗한 Chromium production E2E에서는 재현되지 않았다.

## 안전성과 진실성

- ADR-0013로 이름·이메일 예약자명단 모델을 채택했다. 전화번호는 여전히 받지 않는다. 이름·이메일은 명시적 동의 체크박스 뒤에만 수집하고, 리스트 표시에는 마스킹된 이메일만 노출한다.
- API 키가 클라이언트 bundle, Git, 로그와 화면에 없다.
- 모든 seed 응답과 fixture는 `데모 데이터`로 표시된다.
- 근거 없는 후기, 사용자 수, 효능·매출 수치와 인증이 없다. 단, ADR-0013로 도입한 노출수·CTR·체류시간·이탈률·예약률 예시 지표는 예외이며, 화면에 "예시 지표" 라벨을 반드시 표시해 실측치와 구분한다.
- 시장 검증 완료나 실제 광고 집행을 주장하지 않는다.
- 사용자 입력 문자열 안의 지시문은 실행하지 않고 생성 근거로만 취급하며, Figma·서버 고정값은 AI 문구 슬롯에서 제외한다.

표지 `32`와 `34`의 사진은 팀 공유 Figma Inspect에서 받은 원본이다. Inspect에는 원출처와 라이선스 정보가 없었으므로 행사 공개 제출 전에 디자이너에게 사용권을 확인한다.
