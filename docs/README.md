# 문서 안내

심사와 데모에 필요한 문서부터 읽을 수 있도록 현재 기준 문서를 목적별로 정리했다. 완료된 내부 구현 계획과 운영에서 제거된 목데이터 문서는 저장소에서 제외했으며, 이전 선택의 변화는 Git 이력과 ADR에 남아 있다.

## 제품과 발표

- [제품 브리프](brief.md): 사용자, 사라지는 일, 성공 기준과 범위
- [MVP 스펙](spec.md): 실제 사용자 흐름, 데이터와 API 계약
- [사용자 흐름](user-flow-and-wireframes.md): Before/After와 화면별 요구사항
- [3분 발표 구성](pitch-outline.md): 문제부터 데모와 결론까지의 발표 흐름
- [발표 실행서](demo-runbook.md): 실제 서비스 데모 순서와 장애 대응
- [린캔버스](lean-canvas.md) · [사업계획](business-plan.md) · [시장 리서치](market-research.md)

## 설계와 검증

- [아키텍처](architecture.md): 상태 머신, 외부 시스템과 신뢰 경계
- [검증 기록](validation.md): 실제로 실행한 자동·운영 검증
- [인증](authentication.md): Google OAuth와 세션 경계
- [Meta 연동](meta-ads-setup.md): 광고 생성·활성화·집계 운영 계약
- [자산 이력](asset-provenance.md): 이미지와 디자인 자산 출처 확인 상태
- [결정 기록](decisions/): 주요 선택, 대안과 변경 이유

## 운영

- [배포 가이드](deployment.md): Vercel·Oracle 배포와 rollback
- [외부 연동 현황](integration-roadmap.md): Supabase·Anthropic·Meta 적용 상태
- [작업 기록](../WORKLOG.md): 날짜별 구현·검증·전달 결과
- [트러블슈팅](../TROUBLESHOOTING.md): 실제 장애의 원인·해결·회귀 방지
