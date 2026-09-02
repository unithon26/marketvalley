# ADR-0019: 기존 Oracle VM에서 Kubernetes와 Compose를 분리한다

상태: 채택

기준일: 2026-08-25

## 배경

발표본은 별도 저장소와 tag로 동결하고, 운영 제품은 사용자가 보유한 Oracle Compute `ssumcp`에서 실행한다. 이 VM은 Ubuntu 22.04 ARM64, A1 Flex 4 OCPU·24GB이며 기존 Kubernetes와 Traefik이 host 80·443을 사용한다. 최근 1시간 실측은 CPU 평균 9.07%·최대 9.87%, 메모리 평균 34.5%·최대 35.47%, load average 최대 0.79라 새 VM 없이도 제한된 앱 workload를 수용할 여유가 있다.

운영 DB는 적용·검증한 Supabase를 유지하므로 VM에는 캠페인·예약자 원문을 영속 저장하지 않는다. 요구사항은 기존 VM을 쓰되 marketvalley를 Kubernetes에 붙이지 않고 Docker Compose 기반 인프라로 분리하는 것이다.

## 결정

- Kubernetes·k3s containerd·Traefik·Ingress를 수정하거나 공유하지 않는다. 전용 `marketvalley` Linux 사용자 아래 rootless Docker daemon과 Compose project, network, volume, Buildx builder를 둔다. 이 사용자는 rootful `docker` group에 들어가지 않는다.
- Next.js 16 `output: "standalone"` 산출물을 UID 1001의 read-only 이미지로 실행한다. 현재 2 OCPU·12GB host에서 기존 K3s와 공존하도록 앱은 0.75 CPU·1.5GiB, Caddy는 0.15 CPU·192MiB, BuildKit은 1 CPU·2GiB로 제한한다. 실행 중인 앱과 build가 겹쳐도 K3s 여유를 남기도록 전용 rootless user cgroup은 CPU 125%, 메모리 3GiB, swap 0, task 1024로 제한한다. rootless cgroup v2와 systemd controller delegation이 확인되지 않으면 배포를 거절한다.
- image preflight에도 app과 같은 0.75 CPU·1.5GiB·swap 1.5GiB 상한을 둔다. 최초 배포에서는 `prevent_destroy`로 보호한 50GiB Block Volume을 `/opt/marketvalley`에 별도 mount했다. 2026-09-02 Always Free의 boot+block 합계 200GB와 대조했을 때 200GB boot에 이 volume을 더한 250GB가 무료 한도를 넘으므로, 이를 장기 운영 구조로 유지하지 않는다. 실제 약 2GiB 데이터는 200GB boot의 `/var/lib/marketvalley`로 two-pass rsync하고 `/opt/marketvalley`에 bind mount한다. rootless Docker를 완전히 정지한 final copy와 checksum dry-run, fstab backup, 재기동·reboot·rollback rehearsal을 통과한 뒤에만 이전 volume을 별도 승인으로 삭제한다.
- `boot-bind-v1`은 `/etc/marketvalley-storage-layout`의 root-owned marker, ext4, exact mount target, root filesystem과 같은 device, `FSROOT=/var/lib/marketvalley`, source/target inode 일치와 `nosuid,nodev`를 매 배포에서 검증한다. boot free 40GiB 미만 또는 inode 사용률 90% 초과면 새 배포를 거절한다. Resource Manager가 지원하는 Terraform 1.5.7에는 `removed` block이 없으므로, mode 0600 state를 내려받아 exact volume·attachment 두 주소만 `terraform state rm`한 state를 import하고 storage resource가 없는 config의 plan `No changes`를 확인한다. 새 Block Volume은 만들지 않는다.
- Caddy는 VM 사설 IP `10.0.0.9`의 TCP 13080·13443에만 bind한다. host 80·443과 Kubernetes 네트워크에는 연결하지 않는다. HTTP/3는 사용하지 않고 Caddy가 TLS를 종료한다.
- OCI public Network Load Balancer가 별도 public IP의 TCP 80·443을 각각 13080·13443으로 L4 전달한다. 포트가 다르므로 backend set을 둘로 나누며 source preservation을 꺼 full NAT로 사용한다. HTTP backend는 `/api/health` 200을, HTTPS backend는 TCP 연결을 확인한다.
- NLB와 backend 전용 NSG를 Terraform으로 관리한다. NLB는 인터넷에서 80·443만 받고 backend 고포트는 NLB NSG에서만 허용한다. 기존 primary VNIC를 Terraform attachment로 소유하지 않고, 현재 NSG 목록을 보존하는 검증 스크립트로 backend NSG 하나만 append한다.
- 팀 source 저장소의 GitHub Actions는 품질 게이트, standalone image smoke와 Terraform validation까지만 수행하고 production secret이나 배포 job을 갖지 않는다. 운영 권한은 사용자 개인 소유 비공개 `ghdtjdwn/marketvalley-deploy`에만 두며 collaborator를 추가하지 않는다.
- 배포 저장소는 `workflow_dispatch`로 사용자가 검토한 소문자 40자리 SHA와 `DEPLOY` 확인 문자열을 받는다. 이 SHA가 source `main` 이력에 포함되고 같은 SHA의 고정 `CI / quality` job이 성공했는지 read-only fine-grained PAT으로 확인한 뒤에만 SSH secret을 읽는다. CI 성공은 승인 자체가 아니며 source 앱·workflow·dependency·migration diff에 대한 사용자 검토가 실제 승인 경계다.
- Dockerfile·Compose·Caddy·외부 dependency preflight와 서버 bootstrap·gateway·release manager는 개인 배포 저장소가 소유한다. source tree는 symlink·submodule을 거절하고 runtime contract가 일치할 때만 배포 저장소의 runtime 파일을 덮어쓴 복합 archive로 만든다.
- 전용 SSH key에는 범용 shell 대신 root-owned 강제 명령 gateway를 붙인다. gateway는 최대 256MiB archive를 stdin으로 받고 `current`, `deploy <sha> <digest>`, `rollback <sha>`만 허용한다. scp·SFTP와 임의 명령은 열지 않는다.
- runner는 정확한 Git SHA의 추적 파일만 archive하고 SHA-256을 확인한다. VM은 ARM64에서 native build한 뒤 network 없는 image health와 Anthropic Models API·Supabase schema·Turnstile secret preflight를 모두 통과한 release만 활성화한다.
- workflow는 production credential이 없는 `validate`, source main·동일 CI를 다시 확인하는 `revalidate`, source token이 없는 `deploy` 세 job으로 분리한다. SSH secret은 immutable artifact의 source SHA·control-plane SHA·digest와 production URL을 확인한 뒤에만 step 환경으로 읽는다.
- VM은 archive를 메모리에 전부 펼치지 않고 entry 10,000개·파일 64MiB·전체 1GiB·path 4,096바이트 상한으로 streaming 해제하며 symlink·hardlink·device·FIFO·중복·경로 이탈을 거절한다. source SHA·archive digest·control-plane SHA를 묶은 integrity manifest를 임시 release 안에 기록한 뒤 release directory를 원자적으로 이동하고, manifest 없는 기존 directory에는 새 digest를 결합하지 않는다.
- 새 release의 내부 health가 실패하면 직전 image로 즉시 복구한다. 공개 HTTPS health가 실패해 Actions가 rollback한 경우 공개 endpoint를 한 번 더 확인한다. rollback은 Buildx나 5GiB 여유 디스크, 외부 dependency preflight를 요구하지 않는다.
- SSH 응답이 유실된 경우 `current`는 활성 release lock을 최대 35분 기다려 부분 전환 상태를 읽지 않는다. Actions는 실제 current와 직전 public health를 함께 확인하고 필요할 때만 같은 rollback을 재실행한다.
- 서버의 root-owned release script와 source의 `deploy/runtime-contract`가 일치하지 않는 release는 첫 실행과 rollback 모두 거절한다. 예약 abuse protection migration 뒤 보호 코드가 없는 과거 SHA로 되돌아가는 것을 막는다.
- server secret과 고정 HMAC secret은 VM의 권한 0600 `production.env`에만 둔다. VM에는 GitHub PAT, repository deploy key나 self-hosted runner를 두지 않는다. `/api/health`는 설정 준비 상태와 Git SHA만 반환하며 키 값이나 사용자 데이터는 반환하지 않는다.

## 기각한 대안

### 새 Oracle VM을 만든다

격리는 가장 단순하지만 기존 4 OCPU·24GB VM의 실제 사용률이 낮고 사용자의 요구와 다르다. 불필요한 quota·비용·운영면을 늘려 기각했다.

### 기존 Kubernetes Ingress에 앱을 추가한다

공개 인입은 간단하지만 Compose를 Kubernetes 밖에 두려는 경계를 어기고, 발표 이후 앱 장애가 기존 cluster 설정과 함께 움직인다. 기존 Traefik은 그대로 보존한다.

### Compose가 host 80·443을 직접 사용한다

이미 Traefik이 점유해 시작 자체가 실패한다. rootless Docker도 같은 host port namespace를 사용하므로 해결되지 않는다.

### rootful Docker daemon과 `docker` group을 사용한다

deploy key가 root 수준 daemon 권한을 얻게 되고 기존 workload와 runtime 경계가 약해진다. rootless cgroup 한계를 검증하고 필요한 자원만 위임하는 편이 안전하다.

### 기존 VM public IP의 고포트를 인터넷에 직접 공개한다

포트가 포함된 URL, TLS·OAuth origin 관리와 공격면이 나빠진다. NLB의 표준 80·443과 전용 NSG를 사용한다.

### Cloudflare Tunnel을 추가한다

inbound rule을 줄일 수 있지만 별도 계정·token·agent와 제3자 장애면이 생긴다. 현재 OCI 계정에서 Always Free NLB가 하나도 사용되지 않았으므로 OCI 내부 경계가 더 작다.

### `marketvaley.vercel.app`을 Oracle 도메인으로 사용한다

`vercel.app` 하위 도메인의 DNS는 Vercel 프로젝트가 관리해 OCI NLB로 A record를 변경할 수 없다. Oracle은 NLB IP를 포함한 `sslip.io` hostname과 Caddy 개별 인증서를 사용한다. 사용자가 지정한 주소는 별도 Vercel 공식 배포로 확보했으며 두 대상을 병행하는 결정은 ADR-0020에 기록했다.

### Actions에서 이미지를 빌드해 registry에 push한다

배포는 빨라지지만 registry 자격증명·보존 정책과 ARM·AMD64 artifact 관리가 추가된다. 단일 ARM VM에서는 자원이 제한된 native builder가 더 설명 가능하다.

## 결과와 위험

앱 컨테이너와 build는 기존 Kubernetes가 쓰지 않는 범위로 제한되지만 물리 VM 장애는 공유한다. NLB full NAT에서는 기본적으로 원래 client IP가 앱 로그에 남지 않는다. 필요해지면 OCI Proxy Protocol v2와 Caddy trusted proxy 설정을 함께 검증한 뒤 별도 결정한다.

source 앱은 최종적으로 production 환경변수를 읽고 실행되므로 source CI만으로 악의적 변경을 격리할 수는 없다. 수동 SHA 검토, 개인 배포 저장소의 owner-only 권한과 GitHub 계정 2FA가 운영 보안 경계다. 배포 저장소의 fine-grained PAT은 source 한 저장소의 Contents read·Actions read만 허용하고 짧은 만료일을 사용한다.

OCI Always Free 자격과 실제 사용량은 Console이 최종 기준이다. 2026-09-02 기준 A1은 2 OCPU·12GB, boot는 200GB이고 이전 data volume을 포함한 합계는 250GB였다. boot-backed 이전 뒤 boot+block 합계 200GB 이하와 Cost Analysis 0원을 확인하기 전에는 Geuneul을 추가하지 않는다. Terraform apply, VNIC NSG 변경, storage cutover와 서버 bootstrap은 production 변경이므로 직전 plan과 대상을 다시 확인한다.
