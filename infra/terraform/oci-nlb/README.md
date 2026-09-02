# 기존 VM용 OCI NLB와 boot-backed data layout

이 Terraform은 새 VM·VCN·서브넷·Block Volume을 만들지 않는다. 기존 `ssumcp` VM 앞에 public NLB와 전용 NSG 두 개를 유지하고 public TCP 80·443을 rootless Compose의 `10.0.0.9:13080`·`:13443`으로 전달한다. rootless Docker image·build cache·release·app cache는 200GB boot ext4의 `/var/lib/marketvalley`를 `/opt/marketvalley`에 bind mount한 `boot-bind-v1` layout을 사용한다. 호스트 검증은 매 배포마다 boot 여유 40GiB와 inode 사용률 90% 이하를 강제한다. 기존 k3s·Traefik·Ingress와 VM의 host 80·443은 변경하지 않는다.

HTTP와 HTTPS는 backend port가 다르므로 backend set을 두 개 사용한다. HTTP set은 `/api/health` 200 응답을 검사하고, TLS passthrough set은 인증서 발급 전에도 동작하는 TCP health를 사용한다. source preservation은 명시적으로 꺼 NLB full NAT 경계를 유지한다.

## 적용 경계

- Console에서 Always Free NLB 자격과 boot+block 합계 200GB 이하, Cost Analysis 0원을 확인한 뒤에만 적용한다.
- state와 plan에는 OCID가 포함되므로 Git에 commit하지 않는다. OCI Resource Manager의 managed state를 사용한다.
- OCI Resource Manager는 Terraform 1.5.7까지만 지원해 Terraform 1.7의 `removed` block을 사용할 수 없다. 최신 성공 state를 mode 0600으로 내려받고 `retire-data-volume-state.sh`가 volume·attachment 정확한 두 주소만 제거한 import state와 byte-identical backup을 만든다. 수정 state import와 volume resource가 없는 새 config upload를 완료한 뒤 plan이 `No changes`인지 확인한다. 실제 detach·delete는 boot-backed copy, checksum, 재기동, reboot와 rollback rehearsal을 통과하고 별도 파괴 승인을 받은 뒤에만 실행한다.
- `terraform.tfvars.example`을 복사한 실제 tfvars는 로컬에만 두고 commit하지 않는다.
- state import 전후 address 목록·serial과 import job 성공을 기록하고, `terraform plan`에서 NLB·NSG drift와 Block Volume create/update/delete가 모두 0인지 검토한다. retired volume output 제거와 `marketvalley_storage_layout=boot-bind-v1` 추가 같은 state-only output diff는 허용하지만 어떤 resource action도 적용하지 않는다.
- NLB가 만들어져도 backend NSG를 기존 primary VNIC에 붙이기 전에는 traffic이 열리지 않는다.

기존 primary VNIC를 Terraform attachment resource로 관리하면 기존 Kubernetes 인스턴스의 연결을 잘못 교체할 위험이 있다. 따라서 Terraform output의 backend NSG와 기존 VNIC의 현재 NSG 목록을 대조한 뒤 `attach-backend-nsg.sh`가 기존 목록에 새 NSG만 append한다. 이 스크립트는 VNIC private IP·subnet VCN·ETag 일치, 명시적 `MARKETVALLEY_CONFIRM_ATTACH=yes`, 새 absolute backup 경로를 모두 요구한다. OCI가 412를 반환하면 동시 변경으로 간주해 중단한다.

백업 JSON은 attach 직전의 전체 NSG 배열이며 보관한다. 철거는 `detach-backend-nsg.sh`에 같은 VNIC·backend NSG·backup과 `MARKETVALLEY_CONFIRM_DETACH=yes`를 전달한다. backend NSG 하나를 제거한 결과가 backup과 정확히 같을 때만 ETag 조건부 update를 수행하므로, 그 사이 Kubernetes 측 NSG 변경이 있으면 덮어쓰지 않고 중단한다.

DNS는 NLB output의 public IP로 production A record를 만든다. Caddy가 TCP 80·443 전달 뒤에서 인증서를 발급하므로 DNS propagation과 backend health를 확인한 뒤 개인 배포 저장소에서 검토한 source SHA의 수동 배포 workflow를 실행한다.

host cutover는 `/var/lib/marketvalley`에 live first pass, rootless Docker 완전 정지, final rsync와 checksum dry-run, mode 0600 fstab 백업 순으로 진행한다. `/etc/fstab`에는 정확한 `/var/lib/marketvalley /opt/marketvalley none bind,nosuid,nodev,noatime 0 0` 한 줄만 두고 `/etc/marketvalley-storage-layout`을 root-owned mode 0644의 `boot-bind-v1`으로 기록한다. source와 target의 device·inode, `findmnt` FSROOT, ext4와 mount option이 모두 일치해야 Docker를 시작한다.
