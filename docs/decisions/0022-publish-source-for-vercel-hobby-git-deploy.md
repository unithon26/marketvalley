# ADR-0022: 공개 source와 Vercel Hobby Git 배포를 사용한다

날짜: 2026-08-26

## 맥락

공식 주소 `marketvaley.vercel.app`을 운영할 Vercel 프로젝트는 개인 Hobby 팀에 있다. Vercel은 Hobby 프로젝트에서 조직 소유 비공개 GitHub 저장소 연결을 허용하지 않아 `unithon26/marketvalley` 자동 배포 연결이 409로 거부됐다.

## 결정

- 사용자가 공개를 승인한 `unithon26/marketvalley`를 공개 저장소로 전환한다.
- 공개 전 Git 이력 전체를 비밀정보 검사하고 실제 자격증명이 없을 때만 전환한다.
- Vercel GitHub App은 `unithon26/marketvalley` 한 저장소에만 권한을 준다.
- `main`의 GitHub Actions가 통과한 뒤 Vercel Git 연동이 같은 커밋을 production으로 배포하게 한다.
- `.vercelignore`로 Terraform provider, 로컬 build·test 산출물과 환경 파일을 업로드 대상에서 제외한다.

## 기각한 대안

### Vercel Pro 업그레이드

비공개 조직 저장소를 직접 연결할 수 있지만 현재 단계에서 반복 비용이 필요하다.

### 개인 계정에 비공개 mirror 저장소 생성

원본과 mirror 사이 동기화 자격증명, 이중 이력과 운영 복잡성이 추가된다.

### 개인 Vercel 토큰을 GitHub Actions에 저장

Git 연결 없이 배포할 수 있지만 장기 유효 개인 토큰을 별도로 발급·보관해야 한다. 현재는 공개 source의 최소 권한 GitHub App 연결이 더 단순하다.

## 결과

코드와 문서는 공개 검토가 가능해지고 `main` push가 Vercel production 배포를 자동으로 시작한다. 운영 secret은 GitHub나 source tree가 아니라 Vercel과 Oracle의 환경 저장소에만 둔다.
