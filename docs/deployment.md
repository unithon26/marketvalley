# 기존 Oracle VM의 production 배포

## 현재 확인된 상태

2026-09-02 실제 OCI와 서버에서 다시 확인했다.

- 인스턴스 `ssumcp`: Ubuntu 22.04 ARM64, VM.Standard.A1.Flex, private IP `10.0.0.9`. 원래 4 OCPU·24GB지만 maintenance stop 뒤 A1 capacity 부족으로 1·6에서 복구해 현재 2·12까지 증설했다.
- Kubernetes의 Traefik이 host 80·443을 점유하고 기본 인증서를 반환함
- OCI security list는 80·443 외에 SSH 22와 k3s API 6443을 인터넷 전체에 허용함. host firewall 때문에 6443 외부 연결은 닫혀 있지만 OCI 규칙 자체는 이후 관리 경로 확인 뒤 축소해야 함
- OCI Resource Manager stack이 public NLB, NLB·backend NSG와 전용 50GiB Block Volume attachment를 관리한다. boot 200GB와 합계 250GB라 Always Free 200GB를 넘으므로 boot-backed cutover 뒤 volume 관리를 state에서 인계하고 별도 승인으로 삭제해야 한다.
- 관리자 Ed25519 key의 public IP 직접 접속, 별도 강제 명령 deploy key, Tailscale SSH 복구 경로를 확인함
- 전용 volume은 아직 `/opt/marketvalley`에 ext4 UUID mount되고 rootless Docker 29.7.2 data-root와 release cache를 소유한다. 목표 layout은 200GB boot의 `/var/lib/marketvalley`를 같은 target에 bind mount하는 `boot-bind-v1`이다.
- 공식 사용자 origin용 Vercel 프로젝트 `marketvaley`를 생성했고 `https://marketvaley.vercel.app`에 Turnstile을 제외한 production 환경변수를 등록함. Vercel 계정의 GitHub 앱에 `unithon26/marketvalley` 비공개 저장소 권한을 추가해야 Git 자동 배포가 연결됨
- Oracle 검증 origin은 `https://marketvalley-152-67-213-96.sslip.io`이며 server 환경에는 Anthropic·Supabase·signal secret을 적용함. Turnstile과 OAuth production 설정, 두 대상의 첫 앱 release는 남아 있음

새 VM이나 Kubernetes workload는 만들지 않는다. 기존 VM의 rootless Compose 기반과 owner-only GitHub 배포 자동화만 사용한다. 4·24 복구 전에도 기존 K3s를 보호하는 1.25 CPU·3GiB aggregate 상한으로 첫 release를 허용하고, 실제 사용량을 관측한 뒤에만 상향한다.

## 운영 구조

```text
Internet
  → OCI public NLB TCP 80 / 443
  → NLB 전용 NSG와 full NAT
  → ssumcp 10.0.0.9:13080 / :13443
  → marketvalley 전용 rootless Docker
      Caddy → Next.js standalone
                → Anthropic
                → Supabase Auth·Postgres

기존 ssumcp public IP TCP 80 / 443
  → 기존 Kubernetes Traefik 그대로 유지

OCI 200GiB boot ext4
  → /var/lib/marketvalley bind mount
  → /opt/marketvalley
      rootless Docker data-root·image·build cache
      release·app cache
```

앱과 isolated preflight는 각각 0.75 CPU·1.5GiB, Caddy 0.15 CPU·192MiB, BuildKit 1 CPU·2GiB가 상한이다. 전용 rootless user cgroup은 CPU 125%, 메모리 3GiB, swap 0, task 1024로 한 번 더 묶고 BuildKit은 병렬 1과 1GiB GC cache를 넘기지 않는다. 현재 Oracle host는 4 OCPU·24GB 복구가 capacity 부족으로 거절된 2 OCPU·12GB 상태이므로 이 보수적 상한으로 K3s에 최소 0.75 CPU와 9GiB 메모리를 남긴다. rootless Docker data-root와 release·app cache는 검증된 boot-backed bind mount 안에 두고 boot free 40GiB·inode 사용률 90% 보호선을 유지한다. Next.js와 Caddy는 별도 Compose network를 사용하고 host에 앱 3000을 publish하지 않는다. Caddy는 사설 고포트에만 bind하고 HTTP/3를 끈다. NLB가 표준 포트를 전달하므로 production URL에는 포트 번호가 없다.

구조와 기각 대안은 [ADR-0019](decisions/0019-self-host-on-oracle-with-verified-ssh-releases.md)에 기록했다.

## 1. 관리 접근 복구

가장 안전한 경로는 서버를 만든 팀원이 기존 private SSH key를 찾아 로컬 경로만 알려주는 것이다. key 값 자체를 채팅·Git·로그에 붙이지 않는다.

기존 key를 찾을 수 없으면 Oracle serial console과 recovery mode로 새 관리 public key를 추가해야 한다. 이 과정은 부팅을 중단하고 VM을 재시작하므로 Kubernetes도 잠시 중단된다. production restart 승인과 현재 cluster 상태 확인 뒤 maintenance window에서만 수행한다. Run Command는 이 Ubuntu ARM 이미지의 복구 경로로 사용하지 않는다.

접근 복구 직후 다음을 읽기 전용으로 확인한다.

```bash
uname -a
cat /etc/os-release
df -h
free -h
ss -lntup
systemctl --failed
sudo k3s kubectl get nodes,pods -A
```

기존 80·443 listener, k3s·Traefik pod와 containerd 설정은 변경하지 않는다.

## 2. 전용 deploy key와 rootless Docker

GitHub Actions용 Ed25519 key pair를 별도로 만든다. private key는 로컬 권한 0600과 사용자 개인 비공개 배포 저장소 secret에만 두고, public key 파일만 bootstrap에 전달한다. 기존 관리자 key를 Actions에 재사용하지 않는다.

bootstrap은 처음 만든 전용 사용자만 `/etc/marketvalley-deploy-user` marker로 신뢰한다. 기존 사용자·sudoers·특권 그룹·알 수 없는 SSH key가 있으면 중단하며, 정확히 하나의 Ed25519 key를 `restrict,command="/usr/local/lib/marketvalley/deploy-gateway.sh"`로 설치한다. gateway는 `current`, bounded stdin archive를 받는 `deploy <sha> <digest>`, `rollback <sha>`만 허용하고 범용 shell·scp·SFTP를 열지 않는다. root-owned manager와 release script는 release archive가 교체할 수 없다.

서버 control plane의 권위 있는 사본은 개인 비공개 `ghdtjdwn/marketvalley-deploy`의 `server/`에 둔다. source 저장소의 사본은 코드 검증과 문서화를 위한 mirror이며, bootstrap에는 개인 배포 저장소에서 검토한 파일을 사용한다.

신규 설치의 기본 bootstrap은 전용 non-boot volume만 포맷한다. 현재 운영 host는 Always Free boot+block 200GB를 지키기 위해 아래 storage cutover를 먼저 완료하고 `boot-bind-v1`을 사용한다. 전용 volume 포맷 확인값은 이 이전 절차에서 사용하지 않는다.

```bash
sudo env \
  MARKETVALLEY_DEPLOY_USER=marketvalley \
  MARKETVALLEY_DEPLOY_PUBLIC_KEY_FILE=/absolute/path/marketvalley-deploy.pub \
  MARKETVALLEY_STORAGE_MODE=boot-bind-v1 \
  MARKETVALLEY_CONFIRM_BOOT_BIND=yes \
  deploy/bootstrap-ubuntu-rootless.sh
```

스크립트는 Docker 공식 저장소에서 현재 검증한 버전의 CLI·Compose·Buildx·rootless extras만 설치한다. ARM64 rootless engine archive와 apt signing key의 SHA-256을 고정 검증하고 rootful Docker daemon은 설치하지 않는다. 전용 사용자의 subordinate UID/GID, systemd linger, cgroup v2의 CPU·memory·PID delegation과 rootless socket을 확인한 뒤 검증된 `/opt/marketvalley`만 사용한다.

### Always Free storage cutover

실제 중단 전에는 `findmnt`, `lsblk`, `df -Pk`, `df -Pi`, `fuser`, rootless Docker와 NLB health를 mode 0600 기록으로 남긴다. `/var/lib/marketvalley`가 symlink·mount가 아니고 boot ext4에 있으며 40GiB 이상 여유가 있는지 확인한다. 첫 복사는 서비스를 켠 채 root로 `rsync -aHAXS --numeric-ids --delete --one-file-system /opt/marketvalley /var/lib/`를 사용한다.

컷오버는 배포 gateway와 release lock을 모두 잡고 `marketvalley`의 rootless Docker만 정지한다. socket과 해당 UID의 `dockerd`, `containerd`, `buildkitd`가 사라지고 source mount의 open file이 0인지 확인한 뒤 같은 rsync를 다시 실행한다. 이어 checksum dry-run `rsync -aHAXSnic --numeric-ids --delete --one-file-system /opt/marketvalley/ /var/lib/marketvalley/`의 출력이 비어 있어야 한다.

`/etc/fstab`은 mode 0600 timestamp backup을 만든 뒤 기존 `/opt/marketvalley` entry 하나만 다음 줄로 교체한다.

```fstab
/var/lib/marketvalley /opt/marketvalley none bind,nosuid,nodev,noatime 0 0
```

기존 volume을 unmount하고 새 entry를 mount한 뒤 `/etc` 안의 root-owned mode 0644 임시 파일에 `boot-bind-v1`을 쓰고 검증한 다음 `/etc/marketvalley-storage-layout`로 원자적으로 rename한다. source/target device·inode, ext4, `FSROOT`, mount option, boot free·inode gate를 확인하고 rootless Docker를 시작한다. app·worker·proxy, 공개 health, K3s baseline을 확인한 다음 controlled reboot에서도 같은 상태가 재현돼야 한다.

rollback은 기존 volume을 삭제하지 않은 상태에서 수행한다. 새 layout의 Docker를 먼저 정지하고 boot-backed source의 최신 내용을 임시 mount한 이전 volume으로 reverse rsync·checksum한 뒤 fstab backup과 `dedicated-volume-v1` marker를 복원한다. 데이터가 다시 쓰이기 시작한 뒤 이전 volume을 단순 remount하면 안 된다.

버전이나 checksum이 바뀌면 자동 우회하지 않고 실패한다. Docker 공식 배포물과 release note를 검토해 저장소의 pin을 갱신한 뒤 다시 실행한다.

기준 경로는 다음과 같다.

```text
/opt/marketvalley/
  current -> releases/<git-sha>
  releases/<git-sha>/
  shared/
    production.env
    Caddyfile
    previous-release
```

## 3. OCI NLB·NSG와 storage state handoff

[`infra/terraform/oci-nlb`](../infra/terraform/oci-nlb/README.md)는 기존 VCN·subnet·VM을 생성하거나 소유하지 않고 다음만 만든다.

- public Network Load Balancer 1개
- HTTP·HTTPS backend set, backend와 TCP listener 각 2개
- public 80·443만 받는 NLB NSG
- NLB NSG에서 사설 13080·13443만 받는 backend NSG
- rootless Docker·release·cache를 담는 검증된 boot-backed bind mount와 40GiB·inode 보호선

OCI Resource Manager의 managed state를 사용한다. 실제 tfvars와 Terraform state는 Git에 넣지 않는다. Resource Manager의 최대 Terraform 1.5.7은 `removed` block을 지원하지 않으므로 최신 성공 state를 mode 0600으로 내려받고 `retire-data-volume-state.sh`로 volume·attachment 두 주소만 제거한 state와 원본 backup을 만든다. production state import와 storage resource가 없는 config upload는 저장 hash·address diff를 확인한 같은 maintenance 작업에서 수행한다. 이후 plan에 retired output 교체 외 실제 resource delete나 새 Block Volume create가 있으면 적용하지 않는다. boot-backed 전환, reboot, rollback rehearsal 뒤 별도 파괴 승인으로 기존 volume을 삭제하고 boot+block 합계 200GB 이하와 Cost Analysis 0원을 재확인한다.

Terraform은 기존 primary VNIC를 소유하지 않는다. output의 backend NSG ID를 받은 뒤 `attach-backend-nsg.sh`가 VNIC private IP와 VCN을 검증하고 기존 NSG 목록을 보존한 채 하나만 append한다. `MARKETVALLEY_CONFIRM_ATTACH=yes` 없이는 변경하지 않는다.

NLB가 healthy가 되기 전에는 기존 security list의 22·6443을 건드리지 않는다. 새 deploy key와 별도 관리 경로를 검증한 뒤 22는 확인된 운영자 주소로 제한하고, 6443은 실제 Kubernetes 관리 요구 범위로 축소한다.

## 4. DNS와 server secret

`vercel.app` 하위 도메인은 OCI NLB의 A record로 바꿀 수 없다. 2026-08-26 공식 사용자 URL용 Vercel 프로젝트 `marketvaley`를 생성해 `https://marketvaley.vercel.app` 이름을 확보했다. 같은 Next.js 앱을 Vercel의 공식 사용자 배포와 Oracle Compose의 인프라 검증 배포로 각각 운영하되, 데이터와 인증은 같은 Supabase project를 사용한다.

첫 Oracle 배포는 NLB public IP가 나온 뒤 `marketvalley-<NLB-IP-with-dashes>.sslip.io`를 사용한다. `sslip.io`는 hostname 안의 public IP를 A record로 해석하고 Caddy가 HTTP-01으로 해당 개별 hostname의 TLS 인증서를 발급받을 수 있다. 별도 도메인을 확보하면 같은 NLB IP로 A record를 옮기고 OAuth·Supabase·Turnstile origin을 함께 교체한다. 기존 VM public IP를 가리키면 Traefik으로 들어가므로 사용할 수 없다.

`/opt/marketvalley/shared/production.env`는 `deploy/production.env.example`을 기준으로 서버에서만 채우고 mode 0600을 유지한다.

- `SITE_ADDRESS`, `NEXT_PUBLIC_SITE_URL`: 같은 production HTTPS origin
- `MARKETVALLEY_BIND_ADDRESS=10.0.0.9`
- `MARKETVALLEY_HTTP_PORT=13080`, `MARKETVALLEY_HTTPS_PORT=13443`
- `GEUNEUL_SITE_ADDRESS`, `GEUNEUL_FRONTEND_ORIGIN`: 같은 NLB/Caddy가 제공하는 별도 Geuneul API hostname과 허용할 Vercel exact origin
- `GEUNEUL_BACKEND_UPSTREAM=http://10.0.0.9:13880`: 별도 rootless stack의 사설 high-port origin
- `GEUNEUL_OBJECT_STORAGE_HOST`: scheme·path 없는 OCI S3 compatibility hostname
- `CAMPAIGN_GENERATOR_MODE=anthropic`, model과 Anthropic server key
- `CAMPAIGN_REPOSITORY_MODE=supabase`, URL·publishable key·server key
- 배포 뒤 바꾸지 않을 32바이트 이상의 `SIGNAL_HASH_SECRET`
- `CRON_SECRET`: Oracle lifecycle worker와 내부 endpoint가 공유하는 32바이트 이상 무작위 값
- `META_AUTO_ACTIVATION_ENABLED=true`와 정확한 광고 계정·lifetime 예산 확인값
- `META_INSIGHTS_FINALIZATION_DELAY_MINUTES`: 종료 뒤 최종 Insights 반영 대기 시간

`NEXT_PUBLIC_*`만 공개 build argument로 전달한다. Anthropic·Supabase·Turnstile server key와 HMAC secret은 image, Git, Terraform, Actions log에 넣지 않는다.

Caddy runtime contract v2는 기존 MarketValley site와 별도 Geuneul site를 함께 소유한다. `/object-storage/*`는 exact Geuneul frontend Origin의 OPTIONS/PUT만 허용하고 그 외 method·Origin은 403으로 막는다. prefix만 제거하고 presigned path/query와 고정 upstream Host를 OCI로 전달하며 Caddy에는 Object Storage credential을 두지 않는다. source와 owner-only control-plane의 Caddy·Compose·runtime contract가 함께 바뀌지 않으면 배포를 거부해 다음 MarketValley release가 이 route를 지우지 못하게 한다.

release는 새 image의 network 없는 `/api/health`를 먼저 확인한다. 이어서 Anthropic Models API에서 설정 model을 조회하고 Supabase Auth와 REST OpenAPI에서 `campaigns`, `campaign_reservations`, lifecycle RPC와 예약 원자 RPC를 확인하며 Turnstile Siteverify가 server secret을 인식하는지도 검증한다. 이 검사는 Claude 생성을 호출하거나 예약자 원문을 읽지 않으며, credential·migration·network 실패 시 활성화를 막는다. 광고 생성 횟수 제한 제거 marker가 없으면 새 application을 활성화하지 않는다. Site key와 hostname까지 묶인 실제 Turnstile 검증은 production 도메인의 브라우저 종단에서 별도로 수행한다.

## 5. OAuth production origin

HTTPS가 실제로 열린 뒤 공식 Vercel origin과 Oracle 검증 origin을 다음 설정에 모두 등록한다. Supabase Site URL은 공식 Vercel origin 하나만 사용하고 redirect allow-list에는 두 callback을 둔다.

1. `NEXT_PUBLIC_SITE_URL`
2. Supabase Site URL과 `https://<domain>/auth/callback\?sb_flow_id=*` redirect allow-list
3. Google OAuth Authorized JavaScript origin과 기존 Supabase provider callback

Google callback은 앱 서버가 아니라 기존 Supabase callback URI를 유지한다. 설정 뒤 실제 Google 로그인·새로고침·로그아웃·두 탭 역순 callback을 production URL에서 다시 검증한다.

두 production hostname을 같은 Cloudflare Turnstile widget에 등록하고 public site key와 server secret을 Vercel과 Oracle `production.env`에 넣는다. migration `202608250002_reservation_abuse_protection.sql`을 적용한 뒤 각 hostname의 실제 widget token이 exact `action=reservation`과 요청 origin으로 검증되는지 확인한다. migration과 실제 token 검증 전에는 Supabase production mode를 활성화하지 않는다.

## 6. GitHub 배포 자동화와 수동 승인

팀 source 저장소에는 production environment, SSH secret, deploy job을 두지 않는다. 사용자 개인 비공개 `ghdtjdwn/marketvalley-deploy`는 collaborator 0명을 유지하고 다음 repository secret만 둔다.

- `SOURCE_REPOSITORY_TOKEN`: `unithon26/marketvalley` 한 저장소의 Contents read·Actions read만 가진 만료일이 짧은 fine-grained PAT
- `PRODUCTION_SSH_HOST`: 기존 VM public IP 또는 제한된 관리 주소
- `PRODUCTION_SSH_USER=marketvalley`
- `PRODUCTION_SSH_PRIVATE_KEY`: 전용 Ed25519 private key
- `PRODUCTION_SSH_KNOWN_HOSTS`: 신뢰 가능한 경로로 확인한 host key 한 줄

Repository variables:

- `PRODUCTION_URL=https://<production-domain>`
- `PRODUCTION_SSH_PORT=22`

`Deploy production` workflow에 직접 검토한 소문자 40자리 source SHA와 `DEPLOY`를 입력한다. `validate` job은 production 자격증명 없이 SHA가 source `main`의 ancestor이고 같은 SHA의 push CI와 정확한 `quality` job이 성공했는지 확인한다. source checkout credential은 유지하지 않고, 이후 app build·smoke와 control-plane overlay를 실행해 하루만 보존되는 checksum artifact를 만든다. `revalidate` job이 main ancestry와 동일 CI job을 다시 확인한 뒤에만 별도 `deploy` job이 시작되며, 이 job에는 source token을 전달하지 않는다. SSH key와 production 주소는 artifact의 source SHA·control-plane SHA·digest와 production URL 형식을 모두 검증한 뒤에만 step 환경으로 읽는다.

source의 symlink·submodule을 거절하고 runtime contract를 확인한 뒤, Dockerfile·Compose·Caddy·외부 preflight를 개인 배포 저장소 사본으로 교체해 checksum archive를 만든다. archive는 강제 명령 gateway의 stdin으로만 전송한다. 서버는 10,000개 entry, 파일당 64MiB, 전체 해제 1GiB와 4,096바이트 path 상한 아래 regular file·directory만 빈 임시 디렉터리에 streaming 해제한다. source SHA·archive digest·control-plane SHA를 묶은 integrity manifest를 임시 release 안에 먼저 만든 뒤 디렉터리를 원자적으로 이동한다. 기존 release에 manifest가 없거나 같은 SHA에 다른 digest가 오면 fail-closed한다.

rootless VM은 ARM64 native image build, offline health, 외부 preflight와 Compose health를 통과한 release만 전환한다. public `/api/health`의 origin과 SHA도 일치해야 완료된다. SSH 응답이 유실되면 `current`가 최대 35분 동안 release lock을 기다린 뒤 실제 SHA를 반환하고, Actions는 직전 public SHA와 health가 일치하지 않을 때만 idempotent rollback한다.

내부 activation 실패는 직전 image를 즉시 복구한다. 공개 검증 실패 시 Actions가 수동 rollback entrypoint를 호출하고 rollback 뒤 public health를 다시 확인한다. rollback에는 새 build, 5GiB 여유 디스크나 외부 dependency 검사를 요구하지 않는다.

CI 성공은 배포 승인과 같지 않다. 실행 전 source 앱, `.github/workflows/`, `deploy/`, dependency·lockfile, Supabase migration diff를 검토한다. GitHub 계정에는 2FA 또는 passkey를 유지하고 배포 저장소에 collaborator나 외부 workflow trigger를 추가하지 않는다.

## 7. production 종단 완료 조건

- NLB HTTP·HTTPS backend가 healthy이고 기존 Kubernetes endpoint가 그대로 동작함
- `/api/health`가 production origin, 현재 main SHA와 Anthropic·Supabase ready를 반환함
- 실제 Google 로그인·세션 갱신·로그아웃·동시 callback 성공
- 실제 production hostname의 Turnstile widget token 검증, 만료 뒤 재시도와 invalid token 거절 성공
- 실제 Claude 입력 3종 생성 품질 eval 통과
- 로그인 사용자의 생성·게시, 다른 기기의 공개 예약, 중복 차단, 소유자 예약자명단·판단 저장 성공
- 병렬 예약에서 campaign/global 분당 quota와 campaign total capacity가 DB에서 원자적으로 유지됨
- 다른 계정이 owner route와 예약 원문을 읽지 못함
- PNG 5장·carousel ZIP이 production에서 생성되고 같은 PNG가 실제 Meta 소재에 사용됨
- 접수 뒤 브라우저를 닫아도 Oracle worker가 Claude·랜딩·카드·Meta ACTIVE·Insights 단계를 이어가고 재로그인 화면이 DB 상태를 복원함
- 기존 ACTIVE 캠페인은 중복 Meta 객체 없이 `COLLECTING`으로 이어받고 종료 뒤 PAUSED·final snapshot·`COMPLETED`가 됨
- 실패 SHA를 의도적으로 배포한 controlled rehearsal에서 직전 public health가 복구됨
- SSH 22와 k3s API 6443의 OCI ingress가 실제 관리 범위로 축소됨
- maintenance reboot 뒤 rootless Docker·Compose와 기존 Kubernetes가 모두 자동 복구됨

위 항목을 실제 확인하기 전에는 배포나 production 검증을 완료했다고 기록하지 않는다.
