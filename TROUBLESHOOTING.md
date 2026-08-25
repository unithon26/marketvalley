# Troubleshooting

## 2026-08-26 — Vercel Ready 배포가 모든 경로에서 404를 반환함

### 맥락과 영향

`main`의 첫 Vercel Git production 배포는 install과 `next build`를 성공하고 Ready가 됐지만 공식 URL과 고유 deployment URL의 `/`, `/api/health`가 모두 Vercel `NOT_FOUND` 404를 반환했다. 공개 전 발견돼 사용자 데이터나 예약 요청은 유실되지 않았다.

### 재현과 증거

- deployment `dpl_5Hq9aMnKwdTJmxvJhV1ZDJfX1Rhd`는 source `b46ff14`를 clone하고 Next.js 16 route 20개와 Proxy를 정상 생성했다.
- `vercel project inspect marketvaley`는 Root Directory `.`이지만 Framework Preset을 `Other`, Output Directory를 `public` 또는 `.`로 표시했다.
- 배포 결과의 Builds는 `.` 하나와 0ms로 기록됐고 HTTP 응답에는 앱 헤더 대신 `x-vercel-error: NOT_FOUND`가 있었다.
- 처음에는 Standard Protection이 deployment URL을 Vercel SSO로 보내 별도 장애처럼 보였으나 보호를 해제한 뒤에도 404가 같아 접근 제어와 산출물 인식 문제를 분리했다.

### 원인과 대안

Vercel 프로젝트를 Git 연결 전에 CLI로 만들면서 framework가 `Other`로 고정됐다. 패키지 설치와 `next build` 성공만으로는 이미 저장된 framework preset이 Next.js로 바뀌지 않아 함수와 route가 production 산출물로 배포되지 않았다. Dashboard에서만 preset을 바꾸면 재생성 시 같은 문제가 반복될 수 있어 저장소 계약으로 고정한다.

### 해결과 회귀 방지

루트 `vercel.json`에 공식 schema와 `"framework": "nextjs"`를 명시한다. Vercel Authentication은 사용자용 production 서비스에 맞게 해제하되 Protected Sourcemaps는 유지한다. 후속 배포에서는 project preset, build route, 공식 alias의 `/api/health` 200과 source version을 모두 확인하기 전 성공으로 기록하지 않는다.

### 남은 위험과 예상 질문

후속 Git 배포와 실제 HTTP 종단 검증 전까지 해결 완료가 아니다. 면접에서는 build 성공과 runtime 배포 성공을 왜 분리해서 검증해야 하는지, access protection 302와 platform 404를 어떤 증거로 분리했는지 설명할 수 있다.

## 2026-08-26 — Google OAuth client secret 운영 점검 중 노출 가능성 차단

### 맥락과 영향

production OAuth origin을 추가하는 과정에서 Google Cloud Console의 client 상세 패널이 기존 OAuth client secret 원문을 브라우저 접근성 정보에 포함하는 것을 확인했다. Git이나 로그, 배포 환경에 게시되지는 않았지만 원문이 운영 설정 점검 경로에 나타난 시점부터 기존 secret을 계속 신뢰하지 않았다.

### 원인과 대안

Google Cloud Console은 인증된 관리자에게 client secret 복사 기능을 제공하며 해당 컨트롤의 접근 가능한 이름에 원문이 포함됐다. 기존 secret을 유지한 채 패널만 닫는 방법은 즉시 영향은 없지만 잠재 노출 자격증명을 그대로 두므로 기각했다. 먼저 기존 secret을 삭제하면 Supabase Google 로그인이 끊기므로 무중단 회전 순서를 사용했다.

### 해결

새 Google OAuth client secret을 생성해 화면이나 명령 로그에 출력하지 않고 Supabase Google provider에 직접 반영했다. Supabase가 설정 저장 성공을 반환한 뒤 기존 secret을 비활성화하고 삭제했으며 임시 clipboard와 메모리 버퍼를 비웠다. Authorized JavaScript origins에는 local과 공식 Vercel, Oracle 검증 origin을 등록하고 redirect URI는 기존 Supabase callback 하나를 유지했다.

### 검증과 회귀 방지

- Supabase provider 설정의 `Successfully updated settings` 응답을 확인했다.
- Google client에는 새 secret 하나만 Enabled 상태로 남고 기존 secret의 delete control이 사라진 것을 확인했다.
- 앞으로 credential 상세 화면의 전체 DOM·접근성 snapshot을 기록하지 않고 필요한 상태만 field 단위로 확인한다.
- production OAuth 종단 배포 후 실제 로그인·새로고침·로그아웃과 역순 다중 탭 callback을 재검증한다.

### 남은 위험과 예상 질문

production 앱이 아직 배포되지 않아 새 secret을 사용한 실제 Google 로그인은 남아 있다. 면접에서는 왜 즉시 삭제하지 않고 생성 → provider 반영 → 비활성화 → 삭제 순서를 택했는지, secret 값이 로그와 저장소에 남지 않았음을 어떻게 확인했는지 설명할 수 있다.

## 2026-08-26 — A1 capacity와 실제 OCI 제약이 첫 Compose bootstrap을 연속 중단함

### 맥락·기대·실제 영향

기존 4 OCPU·24GB `ssumcp`를 새 VM 없이 그대로 사용하면서 Kubernetes 밖에 NLB와 rootless Docker Compose를 구성해야 했다. SSH 관리키를 복구하려고 승인된 maintenance stop을 수행한 뒤 기존 A1 인스턴스 시작이 `Out of host capacity`로 거절됐다. 4·24와 2·12, 1·6 시작을 차례로 시도했고 1·6에서만 호스트를 다시 확보했다. 기존 K3s는 약 90초 동안 컨테이너 stop job을 정리한 뒤 정상 부팅했지만 1 CPU에서는 `OutOfcpu`가 발생했다. 2·12 증설은 이후 성공했으나 4·24는 계속 거절돼 현재 capacity 위험이 남아 있다.

서비스 접근 복구 뒤 첫 Resource Manager apply와 bootstrap에서도 세 가지 운영 계약 불일치가 드러났다. A1 VM은 paravirtualized Block Volume의 전송 중 암호화 옵션을 지원하지 않아 attachment만 400으로 실패했다. NSG append 스크립트는 OCI CLI의 실제 `network nsg get --nsg-id` 대신 존재하지 않는 옵션을 사용해 변경 전에 종료됐다. ext4는 label을 최대 16자로 제한하므로 17자 `marketvalley-data`를 자동으로 `marketvalley-dat`로 줄였고, bootstrap의 exact label 검사가 포맷 직후 중단됐다. 모두 앱 공개 전 발견됐으며 기존 K3s 데이터나 VNIC 규칙은 덮어쓰지 않았다.

### 증거·원인과 기각한 대안

- 같은 인스턴스의 START·4·24 resize API가 반복해서 `Out of host capacity`를 반환했고 춘천 리전은 하나의 availability domain만 제공했다. 부트 볼륨이나 OS 오류가 아니라 A1 호스트 배정 제약이었다.
- Tailscale SSH `ubuntu@100.97.34.28`은 동일 SSH host key로 연결됐고 sudo가 가능했다. 새 VM이나 부트 볼륨 교체 대신 기존 경로로 관리자 공개키를 보존 추가했다.
- 첫 Terraform plan은 create 17, update·delete 0이었다. apply 로그에서 NSG·NLB·볼륨 등 16개는 완료됐고 `is_pv_encryption_in_transit_enabled=true` attachment만 400으로 실패했다. 새 VM, K3s ingress 공유와 host 80·443 재사용은 요구사항·격리 경계를 위반하므로 기각했다.
- NSG 스크립트는 VNIC update나 백업 생성 전에 CLI option parsing으로 exit 2였다. 실제 VNIC의 NSG 목록은 여전히 빈 배열이라 부분 변경이 없었다.
- 새 50GiB 디스크는 파티션·signature가 없고 boot disk와 다른 `/dev/sdb`임을 확인한 뒤에만 포맷했다. 실패 뒤 `blkid`가 ext4와 잘린 label을 반환했고 mount는 없었다. 파일시스템을 다시 만들 필요가 없어 `e2label`로 신규 빈 볼륨의 label만 보정했다.

### 해결·검증·회귀 방지

인스턴스는 먼저 1·6으로 복구하고 관리키를 설치한 뒤 2·12로 증설했다. 4·24는 실행 중 resize가 안전하게 거절되는 동안 현재 사양이 유지되는지 확인하고, Oracle 인증·capacity가 확보될 때 재시도한다. Block Volume은 A1에서 지원되지 않는 전송 옵션만 끄고 OCI 기본 저장 암호화와 `prevent_destroy`를 유지했다. 후속 plan은 기존 16개 `no-op`과 attachment 1개 `create`만 보여 그대로 적용했고 최종 attachment가 `ATTACHED`임을 확인했다.

attach·detach 스크립트의 NSG get 옵션을 모두 `--nsg-id`로 고치고 shell 검증 뒤 실행했다. append 직전 VNIC 전체 NSG 배열과 ETag를 mode 0600으로 백업했으며 최종 배열에 backend NSG 하나만 있는 것을 재조회했다. ext4 label 계약은 16자 이하 `marketvalley`로 고정했다. bootstrap은 기존 ext4 UUID·label을 재사용해 idempotent하게 완료됐고 `/opt/marketvalley`가 별도 mount, Docker data-root가 그 아래, rootless user service가 active·enabled인 것을 확인했다. bootstrap 묶음에는 실행 전 source·remote SHA-256 대조와 `production.env.example` 포함 검사를 배포 runbook에 유지한다.

### 남은 위험과 면접 질문

현재 2·12는 기존 K3s와 새 앱의 설계 상한을 동시에 운영하기에 충분하다고 확정할 수 없다. 실제 앱 배포는 4·24 복원 또는 측정 기반 자원 계약 재설계 전까지 fail-closed로 유지한다. A1 전송 중 암호화 미지원은 문서에 공개하고 VM 내부·OCI storage encryption·Supabase 원문 저장 경계로 위험을 줄인다.

- 왜 새 VM을 만들지 않았나? 사용자가 기존 서버 재사용을 명시했고 동일 부트 볼륨·Tailscale 경로로 복구할 수 있었기 때문이다.
- 왜 실패한 apply를 destroy 후 다시 하지 않았나? 관리형 state에 성공 자원이 기록됐고 새 plan으로 16개 `no-op`, attachment 1개만 증명해 불필요한 교체 위험을 피할 수 있었기 때문이다.
- 왜 잘린 label을 허용하지 않았나? storage identity를 exact contract로 검증해야 다른 디스크 오인 mount를 막을 수 있어, 도구의 암묵적 truncation이 아니라 명시적인 유효 label로 계약을 고쳤다.

## 2026-08-25 — 배포 계약 CI가 Compose 타입과 provider 플랫폼을 다르게 가정함

### 맥락·기대·실제 영향

메인 source CI는 운영 Compose 설정의 앱 2GiB·proxy 256MiB 상한과 OCI Terraform provider를 같은 입력으로 검사해야 했다. 통합 커밋 `e04d4b9`의 앱 lint·typecheck·164개 단위 테스트·production build·21개 Chromium E2E는 통과했지만 GitHub Actions run `32857239964`는 Compose 계약에서 중단됐다. 이를 고친 run `32857963223`은 Compose를 통과한 뒤 Terraform provider checksum에서 중단돼 image smoke가 실행되지 않았다. production 배포 전 CI에서 발견돼 사용자 트래픽이나 서버 영향은 없다.

### 재현·증거·원인

같은 Compose 5.5 렌더러로 `config --format json`을 실행하면 `cpus`는 숫자지만 `mem_limit`과 `memswap_limit`은 바이트 값의 문자열로 반환됐다. CI의 `jq`는 이 값을 JSON 숫자와 직접 비교하고 오류 출력도 버려 `false`와 exit 1만 만들었다. Compose 파일의 실제 상한은 올바르고 검증기의 JSON 타입 가정이 잘못됐다. owner-only 배포 workflow에도 같은 비교가 있어 첫 실제 배포 전에 함께 수정했다.

다음 실패는 `.terraform.lock.hcl`을 macOS ARM에서 처음 생성하면서 해당 platform package hash만 기록한 것이 원인이었다. Linux AMD64 runner는 같은 OCI 8.27.0 package를 설치했지만 lockfile에 자기 package와 일치하는 서명 checksum이 없어 readonly validate를 거절했다. provider 버전이나 Terraform 구성 오류는 아니었다.

### 해결·검증·회귀 방지

메모리 네 필드를 `tonumber`로 명시적으로 정규화한 뒤 정확한 바이트 수를 비교하게 했다. CPU·port·host IP·protocol의 기존 exact 비교는 유지했다. source와 배포 control-plane 테스트에 이 정규화를 고정했다. Terraform은 `providers lock -platform=darwin_arm64 -platform=linux_amd64`로 OCI 8.27.0의 서명된 platform checksum을 함께 기록하고 readonly init·validate를 다시 통과시켰다. provider를 추가하거나 갱신할 때 CI runner platform을 lock 단계에 포함해 도구의 직렬화·패키징 차이를 제품 실패로 오인하지 않게 한다.

## 2026-08-25 — 기존 Oracle VM의 80·443과 관리 접근이 Compose 배포를 차단함

### 맥락·기대·실제 영향

운영 제품은 기존 `ssumcp` VM에서 Kubernetes 밖의 Docker Compose로 실행하되 기존 서비스를 중단하지 않아야 했다. 최초 Compose 초안은 Caddy가 host 80·443을 직접 publish한다고 가정했다. 공개 endpoint를 확인하자 두 포트 모두 `TRAEFIK DEFAULT CERT`와 같은 404를 반환해 기존 Kubernetes Traefik이 점유 중이었다. 그대로 적용하면 새 proxy가 시작하지 못하고 같은 port를 쓰는 rollback도 실패한다. 실제 서버에는 적용하지 않아 서비스 영향은 없었다.

서버 내부 listener와 Docker 상태를 확인하려 했지만 로컬과 OCI Cloud Shell에는 기존 VM private SSH key가 없었다. Oracle Agent Run Command는 command record만 `Accepted`가 된 뒤 instance에 전달되지 않았고 이전 command도 만료돼, rootless bootstrap과 내부 검증은 수행하지 못했다.

### 증거·원인

- Oracle Console: Ubuntu 22.04 ARM64 A1 Flex 4 OCPU·24GB, private IP `10.0.0.9`
- 최근 1시간 CPU 평균 9.07%·최대 9.87%, 메모리 평균 34.5%·최대 35.47%로 VM 자체 자원 부족은 아님
- public 80·443의 동일 404와 TLS 기본 인증서가 Traefik임을 확인함
- 로컬 `.ssh`, ssh-agent와 Cloud Shell에는 private key가 없고 공개키 파일만 남아 있음
- Oracle 공식 Run Command 지원 image 목록에 Ubuntu가 포함되지 않으며 실제 command가 전달되지 않음

원인은 새 VM 필요 여부가 아니라 같은 host network namespace의 고정 port 충돌이다. 관리 접근 차단은 애플리케이션 오류가 아니라 기존 private key가 현재 작업 환경에 없는 운영 자격증명 문제다.

### 검토한 대안과 해결

- 새 VM: 자원 실측상 불필요하고 사용자의 요구와 달라 기각했다.
- 기존 Kubernetes Ingress 공유: Compose를 cluster 밖에 분리한다는 경계를 어겨 기각했다.
- public 고포트 직접 공개: URL·TLS·OAuth와 공격면이 나빠 기각했다.
- Cloudflare Tunnel: 별도 token·agent·외부 장애면이 생겨 기각했다.
- Oracle public NLB: 별도 public IP의 80·443을 사설 고포트로 전달해 기존 Traefik을 보존할 수 있어 채택했다.

Compose는 전용 rootless Docker에서 `10.0.0.9:13080`·`:13443`만 bind하고, OCI NLB와 source NSG만 이 포트에 접근하게 바꿨다. 앱·Caddy·BuildKit 자원 상한, offline health, 외부 dependency preflight와 rollback 분리를 추가했다. 관리 접근은 기존 private key의 로컬 경로를 찾는 것이 1순위다. 찾을 수 없으면 production restart 승인을 받은 maintenance window에서 Oracle serial console recovery로 새 관리 public key를 설치한다.

초기 자동화 초안은 팀 source 저장소의 `main` push가 production SSH secret을 직접 사용했다. 이 저장소는 두 collaborator가 push할 수 있고 private GitHub Free에서 환경 승인 규칙을 보안 경계로 강제할 수 없어, source workflow·Dockerfile 변경이 곧 운영 권한으로 이어지는 구조였다. 외부 적용 전에 독립 보안 검토에서 발견해 source deploy job을 제거했다. 사용자 개인 owner-only 배포 저장소가 검토한 40자리 SHA, source main ancestry와 같은 SHA의 `CI / quality` 성공을 확인한 뒤에만 운영 secret을 읽는다. Dockerfile·Compose·Caddy·preflight와 서버 control plane도 개인 저장소가 소유한다.

SSH key의 `restrict` 옵션만으로는 port forwarding 등을 막을 뿐 임의 shell 명령은 계속 실행할 수 있었다. 전용 key를 root-owned forced-command gateway에 고정하고 archive를 최대 256MiB stdin으로 받아 checksum을 재검증하도록 바꿨다. gateway가 허용하는 명령은 `current`, `deploy <sha> <digest>`, `rollback <sha>`뿐이며 scp·SFTP를 사용하지 않는다. rollback은 source release script가 아니라 root-owned 고정 script를 실행하고, reservation abuse migration보다 오래된 코드는 runtime contract에서 거절한다.

후속 보안 검토에서는 세 가지 failure window가 추가로 드러났다. 첫째, 검증과 SSH 사용이 한 job이면 source token·production key의 수명이 겹치고 source main·CI가 artifact build 뒤 바뀔 수 있었다. workflow를 credential 없는 `validate`, source provenance를 다시 확인하는 `revalidate`, source token이 없는 `deploy`로 분리하고 artifact의 source SHA·control-plane SHA·digest와 production URL을 SSH secret step 전에 다시 검사했다. 둘째, SSH ACK 유실 뒤 즉시 `current`를 읽으면 아직 활성화 중인 release의 symlink를 잘못 해석할 수 있었다. `current`가 release lock을 최대 35분 기다리고 Actions가 직전 public SHA와 health를 함께 확인해 필요한 경우에만 rollback하도록 했다. 셋째, 압축을 해제한 directory와 별도 manifest 기록 사이에서 process가 죽으면 같은 source SHA에 새 archive digest가 다시 결합될 수 있었다. 이제 bounded streaming extractor가 빈 임시 directory에 regular file·directory만 만들고, digest와 control-plane SHA를 묶은 integrity manifest를 임시 release 내부에 먼저 기록한 뒤 directory 자체를 원자적으로 이동한다. manifest가 없는 기존 release는 복구하지 않고 fail-closed한다.

압축 해제기는 entry 10,000개, 파일당 64MiB, 전체 1GiB, path 4,096바이트 상한을 적용하고 symlink·hardlink·device·FIFO·중복·경로 이탈을 거절한다. Python 3.10 이상을 bootstrap에서 명시적으로 설치·확인하며 안전 archive와 traversal·symlink·duplicate·entry/file limit 회귀를 별도 단위 테스트로 고정했다.

같은 VM의 boot filesystem을 공유한 채 `IOWeight`와 배포 전 여유 공간만 검사하면 rootless Docker image·build cache나 app cache가 디스크를 채워 Kubernetes까지 중단시킬 수 있었다. 50GiB Block Volume을 별도로 만들고 기존 VM의 consistent device path에 paravirtualized 방식으로 연결하기로 했다. 실제 apply에서 A1 VM이 paravirtualized 전송 중 암호화 옵션을 지원하지 않아 attachment만 실패했고, 지원되지 않는 옵션을 끄되 OCI 저장 암호화는 유지했다. bootstrap은 non-boot whole disk, 50~150GiB 크기, 기존 filesystem 부재와 명시적 format 확인값을 모두 검사한 뒤에만 ext4로 만들며, UUID mount와 Docker `data-root=/opt/marketvalley/docker`를 매 시작·배포에서 다시 확인한다. volume이 mount되지 않으면 rootless Docker user service와 release 모두 fail-closed한다. Terraform volume에는 `prevent_destroy`를 적용해 NLB 철거나 잘못된 destroy plan이 운영 데이터까지 삭제하지 못하게 했다.

### 검증·회귀 방지·남은 위험

Caddy 2.10.2 설정, Compose render의 private high port와 자원 limit, OCI provider 8.27.0 Terraform schema, source secret 부재와 강제 명령 trust boundary를 로컬에서 검증했다. 배포 control plane은 YAML·shell·Python 구문, Node trust boundary 4개와 archive extractor 3개 테스트를 통과했다. CI는 Compose·Caddy·Terraform과 ARM-compatible image build를 다시 검사한다. 실제 NLB health, 기존 Kubernetes 무변경, rootless cgroup enforcement와 restart recovery는 서버 접근 뒤 검증해야 한다.

배포 설계 전에는 `ss -lntup`, cloud security rule, 실제 CPU·memory metric을 먼저 확인한다. port 충돌을 rootless 여부와 혼동하지 않고 host namespace와 public ingress를 별도로 기록한다. Run Command 지원 여부도 image별 공식 목록으로 먼저 확인한다.

면접에서 설명할 핵심은 “한 VM을 공유하되 왜 Kubernetes에 얹지 않았는가”, “rootless가 port 충돌을 해결하지 못하는 이유”, “NLB·NSG·cgroup으로 어떤 장애 경계를 만들었는가”, “팀 source CI와 운영 권한을 왜 분리했는가”, “잃어버린 관리 key를 왜 무중단으로 우회하지 않았는가”다.

## 2026-08-25 — Haiku의 형식상 유효한 광고가 입력에 없는 운영 조건을 생성함

### 맥락·기대·실제 영향

Structured Outputs와 최종 `CampaignSpec` 검증을 통과한 문구도 사용자가 말하지 않은 가격, 할인, 환불, 특정 채널, 일정·준비 조건이나 효과를 공개 랜딩에 넣지 않아야 했다. Claude Haiku 4.5 대표 입력 eval에서 JSON 형식과 길이는 모두 유효하지만 이런 세부사항을 자연스럽게 보완한 결과가 반복됐다. production에는 배포하지 않았으므로 외부 사용자나 광고에는 영향이 없었다.

### 재현·증거·검토한 가설

주입 문구, 공방 빈자리, 마감 음식 세 범주의 입력을 같은 평면 출력 계약으로 실행하고 공개 필드에 입력 근거가 없는 가격·할인·환불·요일·사전 설치·구체 채널·효능 문구가 있는지 검사했다. schema 불일치나 temperature 변동이 원인인지 확인하기 위해 temperature 0과 같은 schema를 유지했지만 세부 확장은 남았다. prompt 지시 부족을 가설로 두고 금지 규칙을 강화했으나, 표현만 바뀐 운영 추론이 계속돼 형식 검증만의 문제는 아니라고 판단했다.

### 근본 원인과 선택

Structured Outputs는 구조를 보장하지만 입력 사실성까지 보장하지 않는다. 짧고 그럴듯한 광고 문구를 완성하려는 모델의 일반화가 비어 있는 운영 정보를 채웠고, 기존 Zod 계약은 이 문장이 문법적으로 유효한지만 확인했다. Haiku 뒤 Sonnet 자동 재시도와 두 번째 LLM 검수는 비용·지연·실패면을 늘려 기각했다. 운영 기본 모델을 Sonnet 4.6 하나로 바꾸고, 모델과 무관하게 서버가 입력 근거가 없는 숫자·가격·할인·환불·구체 채널·성과 주장과 hashtag를 정규화하거나 fail-closed로 거절하도록 했다.

### 검증·회귀 방지·남은 위험

최종 `campaign-spec-v2-reservations-flat-v9`, temperature 0, 재시도 0회와 90초 timeout에서 실제 Sonnet 대표 입력 3종이 약 52.0초·55.8초·56.8초에 완료됐다. 금지 세부사항, hashtag 형식, prompt injection 격리, 숫자 근거와 사람이 예약자명단을 보고 판단하는 hook 자동 조건을 모두 통과했고 문장 자연스러움을 수동 검토했다. 이 세 사례는 전체 정확도를 증명하지 않으므로 새 대표 입력을 운영 회귀 세트에 추가하고 live 실패를 fixture 성공으로 자동 대체하지 않는다. 월 $15 spend limit과 사용자·전체 DB quota도 유지한다.

면접에서 설명할 핵심은 “schema-valid와 fact-grounded가 왜 다른가”, “모델 변경만이 아니라 결정적 서버 검증을 둔 이유”, “자동 재시도를 왜 비용·중복 위험으로 보았는가”다.

## 2026-08-25 — 새 발표 저장소가 잘못된 전역 Git 이메일을 상속함

### 맥락과 실제 영향

발표 전용 저장소를 완전히 새 이력으로 만들 때 모든 commit과 GitHub 기여는 사용자의 GitHub 계정에
연결된 신원을 사용해야 했다. 첫 로컬 root commit 직후 delivery 전 신원 검사를 수행하자 작성자
이메일이 사용자의 이메일이 아니라 GitHub HTTP 404 응답 형태의 문자열로 기록돼 있었다. remote를
만들거나 push하기 전에 발견했으므로 잘못된 신원의 GitHub 이력이나 외부 기여는 생기지 않았다.

### 재현·증거·근본 원인

새 저장소는 별도 local `user.email`이 없어 전역 Git 설정을 상속했다. `git config --global user.email`과
root commit metadata가 같은 비정상 문자열을 반환했고, 기존 메인 저장소는 올바른 repository-local
이메일을 사용해 영향이 없었다. 전역 값이 언제 어떤 명령으로 기록됐는지는 확인 가능한 이력이나
로그가 없어 추측하지 않는다.

### 대응과 검증

발표 저장소에만 사용자의 확인된 `user.name`, `user.email`을 설정하고, 아직 push하지 않은 root
commit을 amend했다. 작성자·커미터 이메일, 로그인된 GitHub 계정, remote owner를 다시 대조한 뒤
처음 push했다. 새 remote clone에서 commit 수가 하나이고 같은 사용자 신원인지 재검증했으며 발표
tag와 release도 수정된 commit을 가리킨다. 전역 설정은 다른 작업 공간에 미칠 수 있어 자동으로
덮어쓰지 않았다.

### 회귀 방지와 면접 질문

모든 새 저장소는 첫 commit 전과 모든 push 전 repository-local identity, commit metadata, 인증된
GitHub 계정을 함께 확인한다. 왜 전역 값을 바로 수정하지 않았는가? 다른 저장소가 의도적으로 쓰는
설정일 가능성을 배제할 수 없고, 이번 전달에는 repository-local 수정이 가장 좁고 검증 가능한
대응이었기 때문이다.

## 2026-08-25 — 루트 랜딩 교체 뒤 인증 bundle smoke가 이전 route를 검사함

### 맥락과 실제 영향

서비스 소개 랜딩을 `/`에 두고 인증 GNB가 있는 프로젝트 화면을 `/dashboard`로 옮긴 뒤에도,
configured production build는 공개 Supabase 설정을 client bundle에 포함하고 서버 비밀값을 포함하지
않아야 했다. `main` push의 lint, typecheck와 단위 테스트는 통과했지만 GitHub Actions run
`32827728636`은 `pnpm test:auth-bundle`에서 실패해 build와 E2E가 실행되지 않았다. 배포 전 CI에서
발견돼 사용자 영향은 없다.

### 재현·증거·근본 원인

1. 공개 Supabase dummy 설정과 서버 전용 sentinel을 주입해 production build를 만든다.
2. smoke script는 정적 `/` HTML에서 `로그인 상태 확인 중`을 찾는다.
3. 새 `/`에는 인증 GNB가 없고 같은 컴포넌트는 `/dashboard`로 이동했으므로 검사가 실패한다.
4. 서버 전용 sentinel의 client chunk 비노출 검사는 실행 전까지 정상 유지됐다.
5. smoke 수정 뒤 전체 E2E를 실행하면 세 시나리오가 이전 `/`의 프로젝트 GNB·`새 광고` 링크·필터를
   계속 찾아 실패했다. 새 랜딩 focused E2E만 실행한 기존 검증으로는 이 경로 의존성을 발견하지 못했다.

제품 회귀가 아니라 검증 대상 route가 화면 이동을 따라가지 못한 것이 원인이다. 인증 검사를
삭제하거나 새 랜딩에 불필요한 GNB를 되돌리는 대신, smoke가 실제 인증 경계인
`.next/server/app/dashboard.html`을 검사하도록 변경했다.

전체 E2E의 이탈 목적지는 `/dashboard`로, 루트 제품 진입은 새 랜딩 CTA로, 프로젝트 필터 검증은
`/dashboard` 직접 진입으로 맞췄다. legacy Supabase service-role key도 별도 sentinel로 추가해 새 secret
key와 같은 client bundle 비노출 경계를 적용했다.

### 검증·회귀 방지·남은 위험

focused `pnpm test:auth-bundle`과 전체 품질 게이트, 새 `main` CI에서 configured 인증 초기 상태와
Anthropic·Supabase·HMAC 서버 secret 비노출을 다시 확인한다. 앞으로 인증 UI route가 바뀌면 화면
E2E뿐 아니라 이 build artifact 검사 대상도 함께 갱신해야 한다. production domain의 실제 OAuth는
배포 설정 뒤 별도로 검증한다.

### 면접 질문과 답변 근거

- 왜 smoke를 제거하지 않았나? client/server 환경변수 경계는 단위 테스트만으로 확인할 수 없고 실제
  production bundle 산출물을 검사해야 하기 때문이다.
- 왜 `/`에 GNB를 다시 넣지 않았나? 인증 경계는 제품 dashboard에 있고 서비스 소개 랜딩의 구조를
  검증 코드에 맞추면 제품 설계를 뒤집게 되기 때문이다.

## 2026-08-25 — Anthropic 전체 스키마가 문법 복잡도 제한으로 생성 요청을 거절함

### 맥락과 기대 동작

Google 로그인과 `ANTHROPIC_API_KEY`를 연결한 로컬 제품에서 `/new` 입력을 제출하면 Claude Haiku
4.5가 한 번의 Structured Outputs 요청으로 광고 문구를 만들고, 서버가 검증한 `CampaignSpec`을
반환해야 했다.

### 실제 동작과 영향

`POST /api/generate`가 503 `campaign_generation_unavailable`을 반환해 광고 생성이 중단됐다. 인증,
same-origin, 입력 검증과 생성 quota는 통과했지만 일반 오류 경계가 upstream 원인을 숨겨 브라우저
응답만으로는 설정·결제·모델·timeout을 구분할 수 없었다. 첫 수정 뒤에도 최종 리뷰 변경을 포함한
코드에서 같은 503이 재발했다. 로컬 실제 계정 검증에서 발견됐고 배포된 서비스 영향은 없다.

### 재현과 증거

1. 로컬 환경을 `CAMPAIGN_GENERATOR_MODE=anthropic`과 Claude Haiku 4.5로 실행한다.
2. 로그인 뒤 `/new`에서 유효한 배경과 솔루션을 제출한다.
3. `/api/generate`는 503을 반환한다.
4. 같은 adapter를 비밀값 없이 직접 실행하면 Anthropic이 400 `invalid_request_error`와 함께 컴파일된
   문법이 너무 크므로 스키마를 단순화하라는 오류를 반환한다.

기존 출력 JSON Schema는 8,341바이트, 속성 71개, 중첩 객체 19개였다. 키 값, 로그인 토큰, 사용자
입력 원문과 upstream 요청 header는 기록하지 않았다.

첫 평면화는 5,600바이트, 속성 42개, 객체 3개로 줄어 실제 요청이 성공했다. 이후 signal label의
순서 의존성을 없애려 배열을 세 문자열 필드로 펼친 최종 리뷰 변경이 스키마를 7,425바이트, 속성
44개로 다시 키웠다. 이 변경 뒤에는 실제 Anthropic 요청 없이 단위 테스트·build·fixture E2E와 CI만
통과했고, 사용자의 재시도와 같은 adapter 직접 실행에서 다시 400 `invalid_request_error`가 재현됐다.

### 검토한 가설과 근본 원인

- 키 누락·형식 오류: 서버 환경에서 키 존재, 길이와 `sk-ant-` 형식만 확인해 제외했다.
- 잘못된 모델: 설정된 snapshot ID가 `claude-haiku-4-5-20251001`임을 확인해 제외했다.
- 로그인 또는 quota 실패: 해당 경계는 각각 별도 401·429·503 코드를 사용하고 실제 응답이 생성기
  오류 코드였으므로 제외했다.
- 결제 오류: 실제 upstream 상태와 유형이 400 `invalid_request_error`여서 제외했다.

전체 `CampaignSpec`에는 AI가 만들 필요가 없는 생성 메타데이터, 판단 기준, 색상, 시각 방향과 여러
단계의 중첩 객체까지 포함돼 있었다. 이를 그대로 Structured Outputs 문법으로 컴파일하면서
Anthropic의 내부 스키마 복잡도 한도를 넘은 것이 근본 원인이다. 스키마를 평면화한 뒤에는 400이
사라졌지만 기존 20초 client timeout이 실제 약 29초 생성보다 짧다는 두 번째 문제가 드러났다.

### 대안과 해결

- 자유 형식 JSON을 프롬프트로만 요청하면 문법 컴파일은 피할 수 있지만 파싱과 필드 누락을 다시
  처리해야 하므로 기각했다.
- 랜딩과 캐러셀을 여러 호출로 나누면 스키마는 작아지지만 비용·대기 시간과 채널 간 불일치가
  늘어나므로 기각했다.
- 한 번의 호출은 유지하되 AI가 소유한 문구와 허용된 template·tone만 평면 계약으로 출력하고,
  서버가 메타데이터·판단 기준·Figma 값을 조립하도록 변경했다.

최종 출력 스키마는 성공이 확인된 5,600바이트, 속성 42개, 객체 3개 계약을 사용한다. signal label은
한 배열 안에서 positive·neutral·negative 순서를 prompt와 조립 테스트로 고정해 문법 복잡도를 늘리지
않고 의미를 보존한다. 최종 결과는 기존 `CampaignSpec` Zod 계약으로 다시 검증한다. timeout은 60초,
SDK 자동 재시도는 0회로 둬 timeout 뒤 같은 유료 요청이 중복 실행될 가능성을 줄였다. 구조화 응답
자체가 비어도 자동 재호출하지 않고 실패를 명시한다.

Anthropic의 문법 컴파일 거절은 일반 upstream 실패와 분리해 내부 `anthropic_schema_error`, HTTP
`campaign_generation_schema_error`로 변환한다. 상세 upstream 문구와 비밀값은 응답에 노출하지
않으면서 다음 재현에서는 네트워크 응답만으로 같은 설정 회귀를 구분할 수 있다.

### 검증과 회귀 방지

- 평면 출력 스키마에 AI 문구 필드가 있고 서버 소유 `schemaVersion`이 없으며 top-level 속성 38개,
  중첩 객체 3개, 직렬화 크기 6,500자 미만인지 단위 테스트로 고정했다.
- signal label 배열을 positive·neutral·negative ID 순서로 조립하고 prompt가 같은 순서를 명시하는지
  검증했다.
- 서버 조립 뒤 generation, 판단 기준, signal option ID, Figma 색상과 전체 랜딩 구조가 기존
  `CampaignSpec`을 만족하는지 검증했다.
- 최종 `campaign-spec-v2-reservations-flat-v2`로 사용자가 실패한 마감한입 입력을 다시 보냈고 약
  31.0초에 `CampaignSpec v2`, hook 3개와 positive·neutral·negative option ID가 최종 검증을 통과했다.

대표 입력 3종의 문구 품질 eval과 Vercel 환경의 실제 route 지연·함수 제한 검증은 남아 있다. 외부
장애 시 fixture 성공으로 위장하지 않고 명시적 503과 발표용 사전 전환을 유지한다.

### 면접 질문과 답변 근거

- 왜 전체 DTO를 모델 출력 스키마로 쓰지 않았나? 서버 소유 필드까지 grammar에 포함해 신뢰 경계와
  복잡도만 키웠기 때문이다. AI 소유 필드만 출력하고 최종 DTO는 서버가 조립한다.
- 왜 여러 API 호출로 나누지 않았나? 한 번의 입력에서 채널 간 고객·문제·CTA 일관성을 유지하고
  비용과 대기 시간을 제한하는 것이 더 중요했기 때문이다.
- timeout을 늘리면서 재시도를 없앤 이유는 무엇인가? 실제 정상 생성이 20초보다 길었고, client
  timeout 뒤 자동 재시도는 첫 요청의 완료 여부를 알 수 없어 중복 과금 가능성이 있기 때문이다.

## 2026-08-25 — Supabase CLI dump dry-run이 임시 DB 자격증명을 출력함

### 맥락과 기대 동작

운영 migration 적용 전 기존 `public` schema와 충돌 가능성을 읽기 전용으로 확인하려 했다.
`supabase db dump --linked --schema public --dry-run`은 실행될 명령만 보여주고 연결 자격증명은
노출하지 않을 것으로 예상했다.

### 실제 동작과 영향

CLI는 `pg_dump` shell script와 함께 `cli_login_postgres` 임시 역할의 접속 환경변수를 터미널에
출력했다. 값은 파일, Git, 외부 검색, 문서에 저장하지 않았고 실제 service key나 프로젝트의
영구 `postgres` 비밀번호는 아니었다. 운영 데이터 변경 전 발견했다.

### 재현·증거와 근본 원인

linked 프로젝트에서 해당 명령을 실행하면 CLI가 실제 dump 대신 `PGHOST`, `PGUSER`,
`PGPASSWORD`를 포함한 실행 script를 출력한다. `--dry-run`이 DB schema의 읽기 전용 미리보기가
아니라 내부 `pg_dump` command 전체를 보여주는 동작임을 명령 출력으로 확인했다.

### 대응과 선택

- 프로젝트를 즉시 unlink 후 relink해 임시 login role 자격증명을 재발급했다.
- 값이 다른 명령, 파일, 로그 또는 외부 도구로 전달되지 않았는지 확인했다.
- 영구 DB 비밀번호 회전은 실제로 노출된 자격증명이 아니므로 불필요한 운영 변경으로 판단해
  수행하지 않았다.
- schema 사전 확인은 `migration list`, `inspect db table-stats`, `db lint --linked`와
  `db push --dry-run`으로 대체했다. 이후 명령은 자격증명 값을 출력하지 않았다.

### 검증과 회귀 방지

재연결 뒤 migration 적용, 원격 lint, 직접 RLS, 실제 repository adapter와 production HTTP 종단
검증이 모두 통과했다. Supabase CLI link metadata는 `supabase/.temp/`로 Git에서 제외했다.
운영 세션을 캡처하거나 공유하는 환경에서는 `db dump --dry-run`을 사용하지 않는다.

### 남은 위험과 면접 질문

기존 터미널 출력은 소급 삭제할 수 없지만 임시 credential은 재발급했고 저장·커밋되지 않았다.
왜 전체 DB 비밀번호를 회전하지 않았는가? 노출된 값은 CLI가 생성한 임시 login role 값이었고,
영구 credential을 바꾸면 불필요한 서비스 영향만 추가되기 때문이다.

## 2026-08-25 — 예약 API의 same-origin 검사가 정상 `127.0.0.1` 요청을 거절함

### 맥락과 기대 동작

공개 예약 API는 JSON과 same-origin 브라우저 요청만 허용하면서 `localhost`, `127.0.0.1`,
reverse proxy를 거친 production 요청을 정상 처리해야 했다. 이 검사는 공개 endpoint의 교차 출처
데이터 주입을 줄이되 실제 예약을 막아서는 안 된다.

### 실제 동작과 영향

production E2E에서 공개 예약 관련 시나리오 4개가 모두 저장 오류를 표시했다. 브라우저 요청은
`http://127.0.0.1:3100`의 정상 same-origin POST였지만 API가 403 `invalid_origin`을 반환했다.
배포 전 자동 테스트에서 발견돼 실제 사용자 데이터 영향은 없다.

### 재현과 증거

1. Next.js production server를 `127.0.0.1:3100`에서 실행한다.
2. `/p/[slug]`에서 이름·이메일·동의를 입력하고 예약한다.
3. Playwright trace의 요청 `Origin`과 `Host`는 모두 `127.0.0.1:3100`이다.
4. Route Handler 응답은 403 `invalid_origin`이고 화면은 저장 실패를 표시한다.

API body, 비밀값과 개인정보는 기록하지 않았고 trace의 header와 상태 코드만 원인 확인에 사용했다.

### 검토한 가설과 근본 원인

- JSON Content-Type 누락: trace에서 `application/json`을 확인해 제외했다.
- fixture repository 실패: repository 호출 전 403이라 제외했다.
- 교차 출처 요청: 브라우저 `Origin`, `Host`, `Referer`가 모두 같아 제외했다.

Next.js가 Route Handler의 내부 `request.url` host를 `localhost`로 정규화한 반면 실제 브라우저
요청의 `Origin`과 `Host`는 `127.0.0.1`이었다. `Origin`을 `request.url.origin`과만 비교해 정상
요청을 다른 출처로 오판한 것이 근본 원인이다.

### 대안과 해결

- origin 검사를 제거하면 회귀는 사라지지만 공개 mutation의 브라우저 보안 경계가 약해져 기각했다.
- 고정된 local host를 예외 처리하면 production proxy와 preview host를 설명하지 못해 기각했다.
- 브라우저가 제어하는 `Host`와 신뢰한 proxy의 `X-Forwarded-Host`·`X-Forwarded-Proto`를 우선하고,
  `request.url`은 fallback으로만 사용하도록 비교 기준을 바꿨다.

잘못된 Origin 형식, host 또는 protocol 불일치는 계속 403으로 거절하고 JSON이 아니면 415로
거절한다.

### 검증과 회귀 방지

- Host와 내부 request URL이 다른 정상 요청, 교차 origin, 잘못된 Content-Type 단위 테스트 통과
- 기존 실패 시나리오 4개 focused Chromium E2E 통과
- production Chromium E2E 16개 전체 통과
- `pnpm check`의 lint·typecheck·단위 테스트 104개와 production build 통과

production에서는 Vercel이 설정한 forwarded header만 신뢰하며, 임의 proxy를 앱 앞에 추가할 때는
해당 proxy가 외부 입력 header를 덮어쓰는지 다시 확인해야 한다.

### 면접 질문과 답변 근거

- 왜 `request.url`만 비교하면 안 됐나? 프레임워크나 reverse proxy가 내부 host로 정규화할 수 있어
  브라우저가 실제로 접속한 authority와 달라질 수 있기 때문이다.
- 검사를 없애지 않은 이유는 무엇인가? 공개 예약 mutation의 교차 출처 데이터 주입 경계를
  유지하면서 정상 proxy 환경만 정확히 해석하는 것이 목적이기 때문이다.

## 2026-08-25 — 127.0.0.1에서 시작한 Google OAuth callback 실패

### 맥락과 기대 동작

로컬 production 서버를 `127.0.0.1:3000`에 bind한 상태에서도 사용자는 Google 로그인을 시작하고, 설정된 `http://localhost:3000/auth/callback`에서 PKCE code를 세션으로 교환할 수 있어야 했다.

### 실제 동작과 영향

`127.0.0.1` 링크에서 Google 로그인을 시작하면 provider 동의 뒤 `/auth/error?code=callback_failed`로 이동했다. 로컬 OAuth 검증만 막혔고 production 배포와 사용자 영향은 없다.

### 재현과 증거

1. 브라우저에서 `http://127.0.0.1:3000`을 연다.
2. Google 로그인을 시작한다.
3. 로그인 시작 응답은 PKCE verifier를 `127.0.0.1`의 host-only cookie로 설정한다.
4. `NEXT_PUBLIC_SITE_URL`에 따라 callback은 `http://localhost:3000/auth/callback`으로 돌아온다.
5. callback 요청에는 다른 host의 verifier cookie가 없어 code 교환이 실패한다.

서버 응답을 비밀값 없이 검사해 요청 origin은 `127.0.0.1`, callback origin은 `localhost`이고 PKCE cookie가 로그인 시작 host에 설정되는 것을 확인했다.

### 근본 원인과 해결

OAuth의 시작 origin과 callback origin이 달랐다. `localhost`와 `127.0.0.1`은 같은 컴퓨터를 가리켜도 cookie 기준으로는 서로 다른 host다. 로그인 handler가 Supabase client와 PKCE cookie를 만들기 전에 요청 origin을 `NEXT_PUBLIC_SITE_URL`과 비교하고, 다르면 query를 보존한 canonical `/auth/google`로 먼저 redirect하도록 수정했다.

### 검증과 회귀 방지

단위 테스트는 Next.js가 `request.url`을 canonical 값으로 정규화하더라도 실제 `Host`·`X-Forwarded-Host`가 `127.0.0.1`이면 `localhost`로 redirect되고 Supabase 호출과 continuation cookie 생성이 일어나지 않는지 검증한다. 최종 인증 focused 테스트 20개, 전체 단위 테스트 73개, configured bundle smoke와 production E2E 14개가 통과했다. 실제 Chrome에서도 `127.0.0.1` 시작, `localhost` canonical 이동, Google 계정 선택, Supabase callback과 로그인 사용자 표시를 확인했다. production에서는 `NEXT_PUBLIC_SITE_URL`, Supabase Site URL·Redirect URL과 실제 공개 origin을 동일하게 유지해야 한다.

### 면접 질문과 답변 근거

- 같은 컴퓨터인데 왜 OAuth가 실패했나? 쿠키의 host 경계에서 `localhost`와 `127.0.0.1`은 별개이기 때문이다.
- callback에서 억지로 복구하지 않은 이유는 무엇인가? verifier가 없는 callback에서는 안전한 code 교환이 불가능하므로, 쿠키 생성 전 origin을 정규화해야 한다.

## 2026-08-25 — 실제 Supabase Auth 설정 후 GNB가 미설정으로 남음

### 맥락과 기대 동작

Google Web client, Supabase Google provider와 local 공개 환경변수를 연결한 production build에서 GNB가 `Google로 로그인`을 표시하고 session API를 조회해야 했다.

### 실제 동작과 영향

`GET /api/auth/session`은 200, `GET /auth/google`은 Google로 302를 반환했지만 GNB는 `로그인 준비 중`으로 남았다. local 실제 계정 검증만 막혔고 fixture 데모와 공개 랜딩에는 영향이 없었다. 배포 전 발견했으므로 production 사용자 영향은 없다.

### 재현과 타임라인

1. `.env.local`에 Supabase URL과 publishable key를 설정한다.
2. production build와 `next start`를 실행한다.
3. 서버 인증 endpoint가 설정을 읽는지 확인한다.
4. `/`를 열면 GNB만 미설정 fallback을 표시한다.

2026-08-25 Google·Supabase 외부 설정 직후 재현했고 같은 세션에서 원인 확인, 수정, 실제 로그인·로그아웃 검증까지 완료했다.

### 검토한 가설과 증거

- 잘못된 Supabase URL·key: 값의 형식과 서버 endpoint 성공으로 제외했다.
- 이전 build 또는 서버 환경: `.env.local`을 읽는 새 production build에서도 재현되어 제외했다.
- provider·redirect 오류: 로그인 시작 전 GNB에서 막히고 서버 302는 정상이라 직접 원인이 아니었다.
- client 환경 경계: `app/page.tsx`가 client component이고 그 import 경로의 `SiteHeader`가 `process.env` 객체 전체를 설정 helper에 넘기는 것을 확인했다.

### 근본 원인

Next.js client bundle은 `process.env.NEXT_PUBLIC_*`의 정적 참조만 치환한다. `hasCompleteSupabaseConfig()`의 기본 인자로 `process.env` 객체 전체를 넘긴 코드는 브라우저에서 빈 환경을 읽어, 같은 설정을 서버는 인식하고 GNB는 인식하지 못했다.

### 대안과 선택

- 홈을 server wrapper와 client dashboard로 분리해 `authEnabled`를 prop으로 전달하는 방법은 경계가 가장 명확하지만 이번 수정 범위보다 큰 화면 구조 변경이 필요했다.
- 공개 환경변수를 client bundle에서 명시적으로 정적 참조하는 helper는 현재 GNB 계약을 유지하며 최소 변경으로 같은 경계를 보장한다.

두 번째 방법을 적용하고, 향후 홈 구조를 server/client로 재편할 때 prop 전달 방식으로 옮길 수 있게 helper 사용 지점을 `SiteHeader` 하나로 제한했다.

### 해결과 검증

`hasCompleteBundledSupabaseConfig()`가 각 `NEXT_PUBLIC_SUPABASE_*` 값을 정적으로 읽도록 하고 `SiteHeader`가 이를 사용하게 했다. 단위 회귀 테스트를 추가하고 Playwright web server에는 Supabase 공개 환경변수를 빈 값으로 명시해 개인 `.env.local`과 관계없이 미설정 fallback을 검증한다. 별도 configured production bundle smoke는 dummy 공개 설정으로 build한 홈 HTML이 세션 확인 초기 상태를 포함하고 미설정 fallback을 포함하지 않는지 확인한다.

수정 후 GNB 로그인 버튼, 실제 Google 동의, Supabase PKCE callback, 사용자 표시, Supabase Auth 사용자 생성, POST 로그아웃과 익명 복귀를 확인했다. 단위 테스트 67개와 production Chromium E2E 14개, lint·typecheck·coverage·audit·peer·diff 검사가 통과했다.

### 회귀 방지와 남은 위험

- client 코드에서 `process.env` 객체 전체를 전달하지 않는다.
- 설정된 실제 종단 검증, configured bundle smoke와 미설정 fixture E2E를 분리한다.
- production domain과 Vercel 환경변수, 실제 도메인의 토큰 갱신·동시 탭 OAuth는 배포 후 확인해야 한다.
- 로그인은 연결됐지만 광고 데이터는 아직 메모리 fixture이므로 G3 RLS 전에는 인증을 소유권 보장으로 간주하지 않는다.

### 면접 질문과 답변 근거

- 서버 endpoint는 됐는데 UI만 실패한 이유는 무엇인가? 서버는 런타임 `process.env`를 읽었지만 client bundle은 정적으로 참조된 공개 변수만 치환했기 때문이다.
- 왜 환경변수 값을 client에 보내도 안전한가? URL과 publishable key는 공개 client 설정이고, Google Client Secret과 service-role key는 Supabase provider와 서버 경계 밖으로 내보내지 않았다.
- 테스트가 개인 환경에 의존하지 않게 한 방법은 무엇인가? Playwright web server에서 공개 Auth 변수를 명시적으로 비워 미설정 fallback을 결정적으로 빌드했다.

## 2026-08-25 — 예약 API 전환 뒤 typecheck와 E2E가 옛 신호 계약을 참조함

### 맥락과 기대 동작

ADR-0013에 따라 `/api/signals`와 익명 3지선다 화면을 `/api/reservations`와 이름·이메일 예약 폼으로 바꾼 뒤, 로컬 OpenAI adapter와 원격 변경을 같은 `main`에 합쳐야 했다. 통합 상태에서 lint, typecheck, 단위 테스트와 production E2E가 모두 새 계약을 검증해야 했다.

### 실제 동작과 영향

Git 병합은 `app/api/_lib/http.ts` 한 곳에서 충돌했고, 첫 typecheck는 삭제된 `app/api/signals/route.ts`를 `.next/dev/types/validator.ts`가 계속 import해 실패했다. 캐시를 정리한 뒤에는 단위 테스트가 통과했지만 E2E가 옛 지표·버튼·API를 기다려 6건 실패하고 1건이 중단됐다. 배포 전 로컬 통합에서 발견돼 production 영향은 없다.

### 재현과 증거

1. OpenAI adapter 커밋 위에 예약자명단 원격 커밋을 merge한다.
2. `pnpm check`를 실행하면 `.next/dev/types/validator.ts`의 `/api/signals` import에서 `TS2307`이 발생한다.
3. 생성 route type을 새로 만든 뒤 `pnpm test:e2e`를 실행한다.
4. `선택형 응답`, `긍정 신호율`, `네, 써보고 싶어요`, `/api/signals`를 기다리는 테스트가 새 화면에서 실패한다.

충돌 전 staged tree와 충돌 해결 뒤 merge tree 해시는 `c9e5d97cb8520831635689f49228dc10c53623fc`로 일치했다. 이는 구형 `InvalidSignalOptionError`만 제거하고 OpenAI의 두 503 오류 처리를 보존한 결과가 사전 통합 스냅샷과 같다는 근거다.

### 검토한 가설과 근본 원인

- route 구현 누락: `/api/reservations` 단위 테스트와 production route 목록에서 존재를 확인해 제외했다.
- Next.js typegen 결함: `next typegen`은 `.next/types`를 갱신하지만 실행 중이던 이전 개발 서버가 만든 `.next/dev/types`도 `tsconfig.json` 검사 대상에 남아 있었다.
- 제품 회귀: 앱은 새 폼과 리포트를 정상 렌더링했고, 실패 locator가 모두 삭제된 신호 계약을 가리켰다.

원인은 API·화면 계약을 바꾼 커밋에 E2E 재작성이 함께 포함되지 않았고, route rename 중 실행 중이던 개발 서버의 생성 type cache가 남은 두 가지였다.

### 해결과 대안

생성 캐시를 삭제하는 대신 작업 공간 밖 임시 디렉터리로 옮겨 복구 가능하게 보존하고 `next typegen`을 다시 실행했다. E2E를 비활성화하거나 assertion을 줄이지 않고 예약 입력, 동의, 성공·중복, 실제 명단, 빈 상태, 오류 재시도, 모바일 키보드, 캠페인 격리와 polling 계약으로 전면 교체했다. cache header는 문자열 전체 일치 대신 `no-store` 포함을 요구해 Next.js의 더 강한 `private, no-cache` 지시를 허용했다.

### 검증과 회귀 방지

- focused 단위 테스트 5파일 33개 통과
- lint·typecheck·단위 테스트 14파일 72개 통과
- configured production auth/server-secret bundle smoke 통과
- production Chromium E2E 14개 통과
- statements 79.29%, branches 73.02%, functions 84.02%, lines 82.32% coverage와 high audit·peer·diff 검사 통과
- GitHub Actions run `32811937835`의 clean checkout 전체 gate 통과

route를 rename할 때는 route 구현, API 계약, E2E endpoint, 접근성 locator와 `.next/dev/types`를 한 작업 단위로 확인한다. CI의 깨끗한 checkout은 stale cache를 재현하지 않으므로 로컬 typecheck도 계속 유지한다.

### 남은 위험과 면접 질문

fixture는 서버 메모리이며 로그인 소유권과 RLS가 아직 연결되지 않았다. production 배포 전 G3에서 예약 원문을 광고 소유자에게만 반환하고 공개 경로에는 노출하지 않아야 한다.

- 왜 단위 테스트는 통과했는데 E2E는 실패했나? repository와 API 단위 계약은 바뀌었지만 사용자 시나리오 locator가 옛 화면 문구와 endpoint를 그대로 사용했기 때문이다.
- 왜 cache header를 정확한 문자열로 비교하지 않았나? 핵심 보안 속성은 `no-store`이며 Next.js가 추가한 `private`와 `no-cache`는 이를 약화하지 않고 강화하기 때문이다.
- 충돌 해결이 양쪽 기능을 보존했다는 근거는 무엇인가? merge 전 준비된 통합 index와 해결 뒤 tree hash를 직접 비교해 동일함을 확인했다.
