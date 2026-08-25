# 기존 VM용 OCI NLB와 전용 data volume

이 Terraform은 새 VM·VCN·서브넷을 만들지 않는다. 기존 `ssumcp` VM 앞에 public NLB와 전용 NSG 두 개를 만들고 public TCP 80·443을 rootless Compose의 `10.0.0.9:13080`·`:13443`으로 전달한다. rootless Docker image·build cache·release·app cache가 Kubernetes의 boot disk를 채우지 않도록 50GiB Block Volume 하나를 같은 VM의 `/dev/oracleoci/oraclevdb`에 paravirtualized 방식으로 연결한다. A1 VM이 paravirtualized 전송 중 암호화 옵션을 지원하지 않아 해당 옵션은 끄지만, OCI Block Volume의 저장 암호화는 유지한다. 기존 k3s·Traefik·Ingress와 VM의 host 80·443은 변경하지 않는다.

HTTP와 HTTPS는 backend port가 다르므로 backend set을 두 개 사용한다. HTTP set은 `/api/health` 200 응답을 검사하고, TLS passthrough set은 인증서 발급 전에도 동작하는 TCP health를 사용한다. source preservation은 명시적으로 꺼 NLB full NAT 경계를 유지한다.

## 적용 경계

- tenancy에 기존 NLB가 0개이고 Console에서 Always Free NLB 자격을 확인한 뒤에만 적용한다. 기존 boot volume이 이미 200GB이므로 추가 50GiB Block Volume은 무료 storage 한도를 넘는 유료 자원으로 취급하고 Billing에서 추적한다.
- state와 plan에는 OCID가 포함되므로 Git에 commit하지 않는다. OCI Resource Manager의 managed state를 사용한다.
- 운영 data volume은 `prevent_destroy`로 보호한다. NLB를 철거하더라도 volume 삭제가 포함된 plan은 실패해야 하며, 정말 삭제해야 할 때만 별도 변경으로 보호를 해제하고 데이터 백업을 확인한다.
- `terraform.tfvars.example`을 복사한 실제 tfvars는 로컬에만 두고 commit하지 않는다.
- `terraform plan`에서 NLB 1개, backend set·backend·listener 각 2개, NSG 2개와 명시된 rule, 50GiB block volume 1개와 기존 VM attachment 1개만 생성되는지 검토한다.
- NLB가 만들어져도 backend NSG를 기존 primary VNIC에 붙이기 전에는 traffic이 열리지 않는다.

기존 primary VNIC를 Terraform attachment resource로 관리하면 기존 Kubernetes 인스턴스의 연결을 잘못 교체할 위험이 있다. 따라서 Terraform output의 backend NSG와 기존 VNIC의 현재 NSG 목록을 대조한 뒤 `attach-backend-nsg.sh`가 기존 목록에 새 NSG만 append한다. 이 스크립트는 VNIC private IP·subnet VCN·ETag 일치, 명시적 `MARKETVALLEY_CONFIRM_ATTACH=yes`, 새 absolute backup 경로를 모두 요구한다. OCI가 412를 반환하면 동시 변경으로 간주해 중단한다.

백업 JSON은 attach 직전의 전체 NSG 배열이며 보관한다. 철거는 `detach-backend-nsg.sh`에 같은 VNIC·backend NSG·backup과 `MARKETVALLEY_CONFIRM_DETACH=yes`를 전달한다. backend NSG 하나를 제거한 결과가 backup과 정확히 같을 때만 ETag 조건부 update를 수행하므로, 그 사이 Kubernetes 측 NSG 변경이 있으면 덮어쓰지 않고 중단한다.

DNS는 NLB output의 public IP로 production A record를 만든다. Caddy가 TCP 80·443 전달 뒤에서 인증서를 발급하므로 DNS propagation과 backend health를 확인한 뒤 개인 배포 저장소에서 검토한 source SHA의 수동 배포 workflow를 실행한다.

volume attachment만으로 파일시스템을 만들거나 mount하지 않는다. host bootstrap은 consistent device가 boot disk가 아니고 비어 있는 단일 disk인지 확인하고 `MARKETVALLEY_CONFIRM_FORMAT_DEVICE=yes`가 있을 때만 ext4로 최초 포맷한다. 이후 UUID를 `/etc/fstab`에 `_netdev,nofail,nodev,nosuid,noatime`로 고정하고 `/opt/marketvalley`에 mount한다. Docker `data-root`, release와 application cache가 모두 이 filesystem 안에 있는지 매 배포에서 재검증한다.
