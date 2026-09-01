# ADR-0020: 공식 Vercel 배포와 Oracle Compose 검증 배포를 병행한다

날짜: 2026-08-26

## 맥락

사용자에게 공개할 주소는 `marketvaley.vercel.app`으로 정했다. `vercel.app` 하위 도메인은 Vercel 프로젝트가 소유하므로 OCI NLB로 DNS를 바꿀 수 없다. 동시에 기존 Oracle VM의 Kubernetes 밖에 Docker Compose 기반 운영 환경과 owner-only 자동 배포를 구축해야 한다.

Oracle A1 host는 원래 4 OCPU·24GB였으나 춘천 AD-1 capacity 부족으로 현재 2 OCPU·12GB만 확보됐다. 기존 K3s의 CPU request가 96%라 Oracle 배포는 강한 자원 상한이 필요하다.

## 결정

- 공식 사용자 배포는 Vercel 프로젝트 `marketvaley`가 `https://marketvaley.vercel.app`에서 제공한다.
- 같은 source SHA를 기존 Oracle VM의 rootless Docker Compose에도 배포해 NLB·TLS·release provenance·health·rollback·재부팅 복구를 검증한다.
- 두 배포는 같은 Supabase project를 사용하되 각 build의 `NEXT_PUBLIC_SITE_URL`은 자신의 HTTPS origin으로 고정한다.
- Supabase redirect allow-list, Google JavaScript origin과 Cloudflare Turnstile hostname에는 두 origin을 모두 등록한다. Supabase Site URL은 공식 Vercel origin을 사용한다.
- Oracle Compose 전체 user cgroup은 1.25 CPU·3GiB로 제한하고 앱 0.75 CPU·1.5GiB, Caddy 0.15 CPU·192MiB, BuildKit 1 CPU·2GiB 상한을 적용한다.
- Oracle NLB의 80/443과 Caddy는 그대로 재사용하되, 별도 hostname의 Geuneul API site도 같은 edge process에서 SNI로 분리한다. Geuneul backend와 데이터는 별도 rootless user/cgroup/Compose에 남아 MarketValley app network·credential과 결합하지 않는다.
- 공유 Caddy의 Geuneul browser upload gateway는 exact Vercel Origin의 OPTIONS/PUT만 받고 다른 `/object-storage/*` 요청은 403으로 거부한다. 고정 OCI S3 compatibility host로 signed path/query를 전달하며 storage credential은 갖지 않는다.

## 기각한 대안

### `marketvaley.vercel.app`을 Oracle NLB로 직접 연결

Vercel 소유 하위 도메인의 DNS를 OCI 주소로 바꿀 수 없어 불가능하다.

### Vercel만 사용하고 Oracle을 제거

공식 공개에는 단순하지만 사용자가 요청한 기존 서버의 Compose 격리, 배포 자동화, rollback과 운영 검증을 충족하지 못한다.

### Oracle만 사용하고 `sslip.io`를 공식 주소로 사용

기술적으로 가능하지만 사용자가 정한 공개 URL을 충족하지 못하고 임시 IP 기반 hostname을 사용자-facing 주소로 남긴다.

## 결과

배포 대상이 둘이므로 환경변수와 OAuth·Turnstile hostname 검증을 각각 수행해야 한다. 대신 Vercel의 공식 공개 안정성과 Oracle의 운영·인프라 포트폴리오 근거를 함께 얻고, 한 대상 장애 시 다른 배포를 진단 기준으로 사용할 수 있다.

Caddy 설정은 source와 owner-only control plane의 runtime contract v2가 함께 소유한다. 두 저장소가 일치하지 않으면 배포가 차단되므로 다음 MarketValley release가 Geuneul route를 이전 설정으로 덮어쓰지 않는다. edge process 장애는 두 hostname에 영향을 줄 수 있어 Caddy validate, 기존 MarketValley health, Geuneul health를 순서대로 통과한 뒤 reload한다.
