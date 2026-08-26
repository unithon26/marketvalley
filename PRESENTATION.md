# 발표 화면 바로 열기

동영상 촬영에 사용한 마지막 발표용 리포트와 같은 캠페인의 공개 랜딩이다. 두 링크는 현재 운영 화면을 직접 열기 때문에 별도 로컬 서버가 필요하지 않다.

- [발표용 Google 로그인 후 수집 완료 리포트 열기](https://marketvaley.vercel.app/login?next=%2Fcampaigns%2F38403915-28e3-4643-844c-5c7388ab7e6c%2Fpresentation)
- [클래스빈자리 랜딩페이지 열기](https://marketvaley.vercel.app/p/campaign-fa5197f4)

첫 번째 링크에서 발표용 Google 계정으로 로그인하면 촬영에 사용한 리포트로 돌아간다. 이미 로그인했다면 [리포트를 직접 연다](https://marketvaley.vercel.app/campaigns/38403915-28e3-4643-844c-5c7388ab7e6c/presentation). 랜딩페이지는 로그인 없이 열린다.

저장소를 받은 노트북에서 두 탭을 한 번에 열려면 의존성 설치 없이 다음 명령을 실행한다.

```bash
node scripts/open-presentation.mjs
```

발표 전에 네트워크 연결, 브라우저 확대 100%, 리포트 로그인 상태를 확인한다. 운영 캠페인이나 예약 폼에는 발표 중 새 데이터를 제출하지 않는다.
