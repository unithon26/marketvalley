#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly deploy_root="/opt/marketvalley"
readonly releases_directory="${deploy_root}/releases"
readonly shared_directory="${deploy_root}/shared"
readonly production_environment="${shared_directory}/production.env"
readonly shared_caddyfile="${shared_directory}/Caddyfile"
readonly current_link="${deploy_root}/current"
readonly previous_release_file="${shared_directory}/previous-release"
readonly deployment_lock="${shared_directory}/deployment.lock"
readonly buildx_builder="marketvalley-production-v2"
readonly buildkit_image="moby/buildkit:buildx-stable-1@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8"
readonly required_release_contract="marketvalley-production-v2"

compose_file=""
compose_tag=""
incoming_directory=""
preflight_container=""
archive_path=""
deploy_uid=""
rootless_socket=""

fail() {
  printf 'marketvalley release error: %s\n' "$1" >&2
  exit 1
}

configure_rootless_runtime() {
  deploy_uid="$(id -u)"
  [[ "${deploy_uid}" != "0" ]] || fail "releases must run as the dedicated non-root deploy user"

  export XDG_RUNTIME_DIR="/run/user/${deploy_uid}"
  rootless_socket="${XDG_RUNTIME_DIR}/docker.sock"
  export DOCKER_HOST="unix://${rootless_socket}"
}

is_release_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

cleanup() {
  if [[ -n "${preflight_container}" ]]; then
    docker rm --force "${preflight_container}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${incoming_directory}" && "${incoming_directory}" == "${releases_directory}/."* && -d "${incoming_directory}" ]]; then
    rm -rf -- "${incoming_directory}"
  fi

  if [[ -n "${archive_path}" && "${archive_path}" == /tmp/marketvalley-*.tar.gz ]]; then
    rm -f -- "${archive_path}"
  fi
}
trap cleanup EXIT

require_runtime() {
  local cgroup_driver=""
  local cgroup_version=""
  local security_options=""
  local user_cgroup="/sys/fs/cgroup/user.slice/user-${deploy_uid}.slice/user@${deploy_uid}.service"

  command -v docker >/dev/null 2>&1 || fail "docker is not installed"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not installed"
  for command_name in awk chmod cp find findmnt flock grep install mkdir mv python3 readlink rm sed seq sha256sum sort stat tar tr; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is not installed"
  done
  [[ -S "${rootless_socket}" ]] || fail "the rootless Docker socket is unavailable"
  [[ "$(stat -c '%u' "${rootless_socket}")" == "${deploy_uid}" ]] \
    || fail "the rootless Docker socket is not owned by the deploy user"

  security_options="$(docker info --format '{{json .SecurityOptions}}' 2>/dev/null)" \
    || fail "the rootless Docker daemon is unavailable"
  [[ "${security_options}" == *rootless* ]] \
    || fail "DOCKER_HOST is not connected to a rootless Docker daemon"
  cgroup_version="$(docker info --format '{{.CgroupVersion}}')"
  cgroup_driver="$(docker info --format '{{.CgroupDriver}}')"
  [[ "${cgroup_version}" == "2" && "${cgroup_driver}" == "systemd" ]] \
    || fail "rootless resource limits require cgroup v2 with the systemd driver"
  [[ -r "${user_cgroup}/cgroup.controllers" ]] \
    || fail "deploy user cgroup v2 controllers are unavailable"
  for controller in cpu memory pids; do
    grep -qw "${controller}" "${user_cgroup}/cgroup.controllers" \
      || fail "${controller} is not delegated to the deploy user cgroup"
  done
  [[ "$(tr -d '[:space:]' <"${user_cgroup}/cpu.max")" == "125000100000" ]] \
    || fail "deploy user aggregate CPU quota must be 125%"
  [[ "$(tr -d '[:space:]' <"${user_cgroup}/memory.max")" == "3221225472" ]] \
    || fail "deploy user aggregate memory limit must be 3 GiB"
  [[ "$(tr -d '[:space:]' <"${user_cgroup}/memory.swap.max")" == "0" ]] \
    || fail "deploy user aggregate memory swap must be disabled"
  [[ "$(tr -d '[:space:]' <"${user_cgroup}/pids.max")" == "1024" ]] \
    || fail "deploy user aggregate task limit must be 1024"
  [[ "$(awk '$1 == "default" { print $2 }' "${user_cgroup}/io.weight")" == "100" ]] \
    || fail "deploy user aggregate I/O weight must be 100"
  [[ "$(findmnt -n -o FSTYPE --target "${deploy_root}")" == "ext4" ]] \
    || fail "marketvalley releases must use the dedicated ext4 volume"
  [[ "$(findmnt -n -o TARGET --target "${deploy_root}")" == "${deploy_root}" ]] \
    || fail "the dedicated marketvalley volume is not mounted"
  [[ "$(docker info --format '{{.DockerRootDir}}')" == "${deploy_root}/docker" ]] \
    || fail "rootless Docker data-root is outside the dedicated volume"

  [[ -f "${production_environment}" ]] || fail "${production_environment} is missing"
  [[ ! -L "${production_environment}" ]] || fail "production.env must not be a symbolic link"
  chmod 600 "${production_environment}"
  mkdir -p "${releases_directory}" "${shared_directory}"
}

validate_release_manifest() {
  local release_sha="$1"
  local archive_digest="$2"
  local release_directory="$3"
  local create_integrity_manifest="$4"
  local embedded_manifest="${release_directory}/deploy/release-manifest"
  local stored_manifest="${release_directory}/.marketvalley-release-integrity"
  local temporary_manifest=""
  local control_plane_sha=""

  [[ -f "${embedded_manifest}" && ! -L "${embedded_manifest}" ]] \
    || fail "release control-plane manifest is missing"
  [[ "$(grep -c '^source_sha=' "${embedded_manifest}")" -eq 1 ]] || fail "release manifest source SHA is invalid"
  [[ "$(grep -c '^control_plane_sha=' "${embedded_manifest}")" -eq 1 ]] || fail "release manifest control-plane SHA is invalid"
  [[ "$(sed -n 's/^source_sha=//p' "${embedded_manifest}")" == "${release_sha}" ]] \
    || fail "release manifest source SHA does not match archive target"
  control_plane_sha="$(sed -n 's/^control_plane_sha=//p' "${embedded_manifest}")"
  is_release_sha "${control_plane_sha}" || fail "release manifest control-plane SHA is invalid"

  if [[ "${create_integrity_manifest}" == "true" ]]; then
    [[ ! -e "${stored_manifest}" && ! -L "${stored_manifest}" ]] \
      || fail "release archive supplied a reserved integrity manifest"
    temporary_manifest="${release_directory}/.marketvalley-release-integrity.$$"
    printf 'archive_sha256=%s\ncontrol_plane_sha=%s\n' "${archive_digest}" "${control_plane_sha}" >"${temporary_manifest}"
    chmod 600 "${temporary_manifest}"
    mv -- "${temporary_manifest}" "${stored_manifest}"
  else
    [[ -f "${stored_manifest}" && ! -L "${stored_manifest}" ]] \
      || fail "existing release has no trusted integrity manifest"
    grep -Fqx "archive_sha256=${archive_digest}" "${stored_manifest}" \
      || fail "the same source SHA was supplied with a different archive digest"
    grep -Fqx "control_plane_sha=${control_plane_sha}" "${stored_manifest}" \
      || fail "the same source SHA was supplied with a different control-plane manifest"
  fi
}

require_deploy_runtime() {
  local available_kilobytes=0

  docker buildx version >/dev/null 2>&1 || fail "Docker Buildx is not installed"
  [[ "$(docker buildx prune --help)" == *"--max-used-space"* ]] \
    || fail "Docker Buildx must support project-scoped cache limits"
  command -v df >/dev/null 2>&1 || fail "df is not installed"

  available_kilobytes="$(df -Pk "${deploy_root}" | awk 'NR == 2 {print $4}')"
  [[ "${available_kilobytes}" =~ ^[0-9]+$ && "${available_kilobytes}" -ge 5242880 ]] \
    || fail "at least 5 GiB of free deployment disk is required"
}

read_environment_value() {
  local key="$1"
  local count=0

  count="$(grep -c "^${key}=" "${production_environment}" || true)"
  [[ "${count}" -eq 1 ]] || fail "${key} must appear exactly once in production.env"
  sed -n "s/^${key}=//p" "${production_environment}" | tr -d '\r'
}

read_optional_environment_value() {
  local key="$1"
  local count=0

  count="$(grep -c "^${key}=" "${production_environment}" || true)"
  [[ "${count}" -le 1 ]] || fail "${key} must not be duplicated in production.env"
  if [[ "${count}" -eq 1 ]]; then
    sed -n "s/^${key}=//p" "${production_environment}" | tr -d '\r'
  fi
}

is_private_ipv4() {
  local address="$1"
  local first=""
  local second=""
  local third=""
  local fourth=""
  local remainder=""
  local octet=""

  IFS=. read -r first second third fourth remainder <<<"${address}"
  [[ -n "${first}" && -n "${second}" && -n "${third}" && -n "${fourth}" && -z "${remainder}" ]] \
    || return 1
  for octet in "${first}" "${second}" "${third}" "${fourth}"; do
    [[ "${octet}" =~ ^(0|[1-9][0-9]{0,2})$ ]] || return 1
    (( 10#${octet} <= 255 )) || return 1
  done

  (( 10#${first} == 10 )) \
    || (( 10#${first} == 192 && 10#${second} == 168 )) \
    || (( 10#${first} == 172 && 10#${second} >= 16 && 10#${second} <= 31 ))
}

is_bounded_integer() {
  local value="$1"
  local minimum="$2"
  local maximum="$3"

  [[ "${value}" =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  (( 10#${value} >= minimum && 10#${value} <= maximum ))
}

validate_production_environment() {
  local anthropic_key=""
  local anthropic_model=""
  local bind_address=""
  local cron_secret=""
  local generator_mode=""
  local geuneul_backend_host=""
  local geuneul_backend_port=""
  local geuneul_backend_upstream=""
  local geuneul_frontend_origin=""
  local geuneul_object_storage_host=""
  local geuneul_site_address=""
  local hash_secret=""
  local http_port=""
  local https_port=""
  local meta_access_token=""
  local meta_auto_activation_ad_account_id=""
  local meta_auto_activation_enabled=""
  local meta_auto_activation_lifetime_budget_minor=""
  local meta_ad_account_id=""
  local meta_ads_mode=""
  local meta_allowed_destination_origin=""
  local meta_app_secret=""
  local meta_draft_daily_global_limit=""
  local meta_draft_daily_owner_limit=""
  local meta_draft_duration_hours=""
  local meta_draft_lead_minutes=""
  local meta_draft_lifetime_budget_minor=""
  local meta_draft_operator_user_ids=""
  local meta_instagram_actor_id=""
  local meta_insights_finalization_delay_minutes=""
  local meta_max_lifetime_budget_minor=""
  local meta_operation_ledger_mode=""
  local meta_page_id=""
  local meta_verified_binding=""
  local meta_verified_binding_at=""
  local publishable_key=""
  local repository_mode=""
  local reservation_campaign_minute_limit=""
  local reservation_campaign_total_limit=""
  local reservation_global_minute_limit=""
  local service_key=""
  local service_role_key=""
  local site_address=""
  local site_url=""
  local supabase_url=""
  local turnstile_secret_key=""
  local turnstile_site_key=""
  local turnstile_verify_timeout_ms=""

  site_address="$(read_environment_value SITE_ADDRESS)"
  site_url="$(read_environment_value NEXT_PUBLIC_SITE_URL)"
  generator_mode="$(read_environment_value CAMPAIGN_GENERATOR_MODE)"
  anthropic_key="$(read_environment_value ANTHROPIC_API_KEY)"
  anthropic_model="$(read_environment_value ANTHROPIC_TEXT_MODEL)"
  repository_mode="$(read_environment_value CAMPAIGN_REPOSITORY_MODE)"
  supabase_url="$(read_environment_value NEXT_PUBLIC_SUPABASE_URL)"
  publishable_key="$(read_environment_value NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
  service_key="$(read_optional_environment_value SUPABASE_SECRET_KEY)"
  service_role_key="$(read_optional_environment_value SUPABASE_SERVICE_ROLE_KEY)"
  hash_secret="$(read_environment_value SIGNAL_HASH_SECRET)"
  cron_secret="$(read_environment_value CRON_SECRET)"
  turnstile_site_key="$(read_environment_value NEXT_PUBLIC_TURNSTILE_SITE_KEY)"
  turnstile_secret_key="$(read_environment_value TURNSTILE_SECRET_KEY)"
  turnstile_verify_timeout_ms="$(read_environment_value TURNSTILE_VERIFY_TIMEOUT_MS)"
  reservation_campaign_minute_limit="$(read_environment_value RESERVATION_CAMPAIGN_MINUTE_LIMIT)"
  reservation_global_minute_limit="$(read_environment_value RESERVATION_GLOBAL_MINUTE_LIMIT)"
  reservation_campaign_total_limit="$(read_environment_value RESERVATION_CAMPAIGN_TOTAL_LIMIT)"
  bind_address="$(read_environment_value MARKETVALLEY_BIND_ADDRESS)"
  http_port="$(read_environment_value MARKETVALLEY_HTTP_PORT)"
  https_port="$(read_environment_value MARKETVALLEY_HTTPS_PORT)"
  geuneul_site_address="$(read_environment_value GEUNEUL_SITE_ADDRESS)"
  geuneul_frontend_origin="$(read_environment_value GEUNEUL_FRONTEND_ORIGIN)"
  geuneul_backend_upstream="$(read_environment_value GEUNEUL_BACKEND_UPSTREAM)"
  geuneul_object_storage_host="$(read_environment_value GEUNEUL_OBJECT_STORAGE_HOST)"
  meta_ads_mode="$(read_optional_environment_value META_ADS_MODE)"
  meta_ads_mode="${meta_ads_mode:-disabled}"

  [[ "${site_address}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "${site_address}" == *.* ]] \
    || fail "SITE_ADDRESS must be a plain production domain"
  [[ "${site_address}" != "marketvalley.example.com" ]] \
    || fail "SITE_ADDRESS still contains the example domain"
  [[ "${site_url}" == "https://${site_address}" ]] \
    || fail "NEXT_PUBLIC_SITE_URL must exactly match https://SITE_ADDRESS"
  [[ "${generator_mode}" == "anthropic" ]] \
    || fail "production CAMPAIGN_GENERATOR_MODE must be anthropic"
  [[ -n "${anthropic_key}" && "${anthropic_key}" != replace-with-* ]] \
    || fail "ANTHROPIC_API_KEY still contains a placeholder"
  [[ "${anthropic_model}" =~ ^[a-zA-Z0-9._-]{1,128}$ ]] \
    || fail "ANTHROPIC_TEXT_MODEL is invalid"
  [[ "${repository_mode}" == "supabase" ]] \
    || fail "production CAMPAIGN_REPOSITORY_MODE must be supabase"
  [[ "${supabase_url}" =~ ^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]{1,5})?$ ]] \
    || fail "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin"
  [[ "${supabase_url}" != "https://project.supabase.co" ]] \
    || fail "NEXT_PUBLIC_SUPABASE_URL still contains the example project"
  [[ -n "${publishable_key}" && "${publishable_key}" != replace-with-* ]] \
    || fail "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY still contains a placeholder"
  if [[ -z "${service_key}" || "${service_key}" == replace-with-* ]]; then
    [[ -n "${service_role_key}" && "${service_role_key}" != replace-with-* ]] \
      || fail "a non-placeholder Supabase server key is required"
  fi
  [[ "${#hash_secret}" -ge 32 && "${hash_secret}" != replace-with-* ]] \
    || fail "SIGNAL_HASH_SECRET must be a non-placeholder value of at least 32 characters"
  [[ "${#cron_secret}" -ge 32 && "${cron_secret}" != replace-with-* ]] \
    || fail "CRON_SECRET must be a non-placeholder value of at least 32 characters"
  [[ -n "${turnstile_site_key}" && "${turnstile_site_key}" != replace-with-* \
    && "${#turnstile_site_key}" -le 256 ]] \
    || fail "NEXT_PUBLIC_TURNSTILE_SITE_KEY must be a non-placeholder value of at most 256 characters"
  [[ -n "${turnstile_secret_key}" && "${turnstile_secret_key}" != replace-with-* \
    && "${#turnstile_secret_key}" -le 256 ]] \
    || fail "TURNSTILE_SECRET_KEY must be a non-placeholder value of at most 256 characters"
  is_bounded_integer "${turnstile_verify_timeout_ms}" 500 10000 \
    || fail "TURNSTILE_VERIFY_TIMEOUT_MS must be an integer between 500 and 10000"
  is_bounded_integer "${reservation_campaign_minute_limit}" 1 1000 \
    || fail "RESERVATION_CAMPAIGN_MINUTE_LIMIT must be an integer between 1 and 1000"
  is_bounded_integer "${reservation_global_minute_limit}" 1 100000 \
    || fail "RESERVATION_GLOBAL_MINUTE_LIMIT must be an integer between 1 and 100000"
  is_bounded_integer "${reservation_campaign_total_limit}" 1 1000000 \
    || fail "RESERVATION_CAMPAIGN_TOTAL_LIMIT must be an integer between 1 and 1000000"
  (( 10#${reservation_campaign_minute_limit} <= 10#${reservation_global_minute_limit} )) \
    || fail "RESERVATION_CAMPAIGN_MINUTE_LIMIT must not exceed RESERVATION_GLOBAL_MINUTE_LIMIT"
  [[ "${meta_ads_mode}" == "live" ]] \
    || fail "production campaign lifecycle requires META_ADS_MODE=live"
  if [[ "${meta_ads_mode}" == "live" ]]; then
    meta_operation_ledger_mode="$(read_environment_value META_OPERATION_LEDGER_MODE)"
    meta_draft_operator_user_ids="$(read_environment_value META_DRAFT_OPERATOR_USER_IDS)"
    meta_ad_account_id="$(read_environment_value META_AD_ACCOUNT_ID)"
    meta_page_id="$(read_environment_value META_PAGE_ID)"
    meta_instagram_actor_id="$(read_environment_value META_INSTAGRAM_ACTOR_ID)"
    meta_verified_binding="$(read_environment_value META_VERIFIED_PAGE_INSTAGRAM_BINDING)"
    meta_verified_binding_at="$(read_environment_value META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT)"
    meta_allowed_destination_origin="$(read_environment_value META_ALLOWED_DESTINATION_ORIGIN)"
    meta_max_lifetime_budget_minor="$(read_environment_value META_MAX_LIFETIME_BUDGET_MINOR)"
    meta_draft_lifetime_budget_minor="$(read_environment_value META_DRAFT_LIFETIME_BUDGET_MINOR)"
    meta_draft_lead_minutes="$(read_environment_value META_DRAFT_LEAD_MINUTES)"
    meta_draft_duration_hours="$(read_environment_value META_DRAFT_DURATION_HOURS)"
    meta_insights_finalization_delay_minutes="$(read_environment_value META_INSIGHTS_FINALIZATION_DELAY_MINUTES)"
    meta_access_token="$(read_environment_value META_ACCESS_TOKEN)"
    meta_app_secret="$(read_environment_value META_APP_SECRET)"
    meta_auto_activation_enabled="$(read_environment_value META_AUTO_ACTIVATION_ENABLED)"
    meta_auto_activation_ad_account_id="$(read_environment_value META_AUTO_ACTIVATION_AD_ACCOUNT_ID)"
    meta_auto_activation_lifetime_budget_minor="$(read_environment_value META_AUTO_ACTIVATION_LIFETIME_BUDGET_MINOR)"

    [[ "${meta_operation_ledger_mode}" == "supabase" ]] \
      || fail "live Meta drafts require META_OPERATION_LEDGER_MODE=supabase"
    [[ "${meta_draft_operator_user_ids}" =~ ^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36}){0,19}$ ]] \
      || fail "META_DRAFT_OPERATOR_USER_IDS must contain 1 to 20 comma-separated UUIDs"
    [[ "${meta_ad_account_id}" =~ ^[0-9]{5,32}$ \
      && "${meta_page_id}" =~ ^[0-9]{5,32}$ \
      && "${meta_instagram_actor_id}" =~ ^[0-9]{5,32}$ ]] \
      || fail "Meta account, Page, and Instagram IDs must contain digits only"
    [[ "${meta_verified_binding}" == "${meta_page_id}:${meta_instagram_actor_id}" ]] \
      || fail "META_VERIFIED_PAGE_INSTAGRAM_BINDING must match the configured Page and Instagram IDs"
    [[ "${meta_verified_binding_at}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]] \
      || fail "META_PAGE_INSTAGRAM_BINDING_VERIFIED_AT must be a canonical UTC timestamp"
    [[ "${meta_allowed_destination_origin}" =~ ^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]{1,5})?$ ]] \
      || fail "META_ALLOWED_DESTINATION_ORIGIN must be an HTTPS origin"
    is_bounded_integer "${meta_max_lifetime_budget_minor}" 100 100000000 \
      || fail "META_MAX_LIFETIME_BUDGET_MINOR is invalid"
    is_bounded_integer "${meta_draft_lifetime_budget_minor}" 100 "${meta_max_lifetime_budget_minor}" \
      || fail "META_DRAFT_LIFETIME_BUDGET_MINOR must not exceed the Meta hard cap"
    is_bounded_integer "${meta_draft_lead_minutes}" 5 1440 \
      || fail "META_DRAFT_LEAD_MINUTES must be between 5 and 1440"
    is_bounded_integer "${meta_draft_duration_hours}" 1 72 \
      || fail "META_DRAFT_DURATION_HOURS must be between 1 and 72"
    is_bounded_integer "${meta_insights_finalization_delay_minutes}" 1 1440 \
      || fail "META_INSIGHTS_FINALIZATION_DELAY_MINUTES must be between 1 and 1440"
    [[ "${meta_auto_activation_enabled}" == "true" ]] \
      || fail "live Meta lifecycle requires META_AUTO_ACTIVATION_ENABLED=true"
    [[ "${meta_auto_activation_ad_account_id}" == "${meta_ad_account_id}" ]] \
      || fail "META_AUTO_ACTIVATION_AD_ACCOUNT_ID must match META_AD_ACCOUNT_ID"
    [[ "${meta_auto_activation_lifetime_budget_minor}" == "${meta_draft_lifetime_budget_minor}" ]] \
      || fail "META_AUTO_ACTIVATION_LIFETIME_BUDGET_MINOR must match META_DRAFT_LIFETIME_BUDGET_MINOR"
    [[ -n "${meta_access_token}" && "${meta_access_token}" != replace-with-* ]] \
      || fail "META_ACCESS_TOKEN must be a non-placeholder secret"
    [[ "${meta_app_secret}" =~ ^[0-9a-fA-F]{32}$ ]] \
      || fail "META_APP_SECRET must be a 32-character hexadecimal secret"
  fi
  is_private_ipv4 "${bind_address}" \
    || fail "MARKETVALLEY_BIND_ADDRESS must be a private IPv4 address"
  [[ "${http_port}" =~ ^[1-9][0-9]{3,4}$ && "${http_port}" -ge 1024 && "${http_port}" -le 65535 ]] \
    || fail "MARKETVALLEY_HTTP_PORT must be a high TCP port"
  [[ "${https_port}" =~ ^[1-9][0-9]{3,4}$ && "${https_port}" -ge 1024 && "${https_port}" -le 65535 ]] \
    || fail "MARKETVALLEY_HTTPS_PORT must be a high TCP port"
  [[ "${http_port}" != "${https_port}" ]] \
    || fail "MARKETVALLEY_HTTP_PORT and MARKETVALLEY_HTTPS_PORT must differ"
  [[ "${geuneul_site_address}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ \
    && "${geuneul_site_address}" == *.* \
    && "${geuneul_site_address}" != *.example.com \
    && "${geuneul_site_address}" != "${site_address}" ]] \
    || fail "GEUNEUL_SITE_ADDRESS must be a distinct non-example production domain"
  [[ "${geuneul_frontend_origin}" =~ ^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]{1,5})?$ \
    && "${geuneul_frontend_origin}" != *example.com* ]] \
    || fail "GEUNEUL_FRONTEND_ORIGIN must be a non-example HTTPS origin"
  if [[ "${geuneul_backend_upstream}" =~ ^http://([^:/]+):([0-9]{4,5})$ ]]; then
    geuneul_backend_host="${BASH_REMATCH[1]}"
    geuneul_backend_port="${BASH_REMATCH[2]}"
  else
    fail "GEUNEUL_BACKEND_UPSTREAM must be an HTTP private IPv4 high-port origin"
  fi
  is_private_ipv4 "${geuneul_backend_host}" \
    || fail "GEUNEUL_BACKEND_UPSTREAM must use a private IPv4 address"
  is_bounded_integer "${geuneul_backend_port}" 1024 65535 \
    || fail "GEUNEUL_BACKEND_UPSTREAM must use a high TCP port"
  [[ "${geuneul_backend_port}" != "${http_port}" && "${geuneul_backend_port}" != "${https_port}" ]] \
    || fail "GEUNEUL backend port must not collide with the Caddy bind ports"
  [[ "${geuneul_object_storage_host}" =~ ^[a-zA-Z0-9.-]+\.compat\.objectstorage\.[a-z0-9-]+\.oci\.customer-oci\.com$ \
    && "${geuneul_object_storage_host}" != namespace.* ]] \
    || fail "GEUNEUL_OBJECT_STORAGE_HOST must be an exact OCI S3 compatibility hostname"
}

acquire_deployment_lock() {
  local operation="$1"
  exec 9>"${deployment_lock}"
  if [[ "${operation}" == "current" ]]; then
    flock --wait 2100 9 || fail "timed out waiting for the active deployment to finish"
  else
    flock --nonblock 9 || fail "another deployment or rollback is already running"
  fi
}

ensure_buildx_builder() {
  local builder_inspect=""
  local buildkit_container="buildx_buildkit_${buildx_builder}0"
  local resource_limits=""

  if docker buildx inspect "${buildx_builder}" >/dev/null 2>&1; then
    builder_inspect="$(docker buildx inspect "${buildx_builder}" 2>/dev/null || true)"
    resource_limits="$(docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.CpuQuota}}' "${buildkit_container}" 2>/dev/null || true)"
    if ! grep -Eq '^Driver:[[:space:]]+docker-container[[:space:]]*$' <<<"${builder_inspect}" \
      || [[ "${resource_limits}" != "2147483648 100000" ]]; then
      docker buildx rm "${buildx_builder}" >/dev/null \
        || fail "the dedicated Buildx builder could not be safely recreated"
    fi
  fi

  if ! docker buildx inspect "${buildx_builder}" >/dev/null 2>&1; then
    BUILDX_DEFAULT_POLICY=1 docker buildx create \
      --name "${buildx_builder}" \
      --driver docker-container \
      --driver-opt "image=${buildkit_image}" \
      --driver-opt memory=2g \
      --driver-opt cpu-quota=100000 \
      --buildkitd-flags '--oci-max-parallelism=1 --oci-worker-gc=true --oci-worker-gc-keepstorage=1024' \
      --driver-opt default-load=true >/dev/null
  fi

  docker buildx inspect "${buildx_builder}" --bootstrap >/dev/null \
    || fail "the dedicated marketvalley Buildx builder is unavailable"

  builder_inspect="$(docker buildx inspect "${buildx_builder}" 2>/dev/null || true)"
  grep -Eq '^Driver:[[:space:]]+docker-container[[:space:]]*$' <<<"${builder_inspect}" \
    || fail "the dedicated Buildx builder must use the docker-container driver"
  resource_limits="$(docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.CpuQuota}}' "${buildkit_container}" 2>/dev/null || true)"
  [[ "${resource_limits}" == "2147483648 100000" ]] \
    || fail "the dedicated Buildx builder must be limited to 2 GiB and 1 CPU"
}

build_release_image() {
  local release_sha="$1"
  local release_directory="${releases_directory}/${release_sha}"
  local site_url=""
  local supabase_url=""
  local publishable_key=""
  local had_image=0

  site_url="$(read_environment_value NEXT_PUBLIC_SITE_URL)"
  supabase_url="$(read_environment_value NEXT_PUBLIC_SUPABASE_URL)"
  publishable_key="$(read_environment_value NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"

  ensure_buildx_builder
  docker image inspect "marketvalley:${release_sha}" >/dev/null 2>&1 && had_image=1
  if ! docker buildx build \
    --builder "${buildx_builder}" \
    --load \
    --pull \
    --file "${release_directory}/deploy/Dockerfile" \
    --tag "marketvalley:${release_sha}" \
    --build-arg "NEXT_PUBLIC_SITE_URL=${site_url}" \
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=${supabase_url}" \
    --build-arg "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable_key}" \
    "${release_directory}"; then
    if [[ "${had_image}" -eq 0 ]]; then
      docker image rm "marketvalley:${release_sha}" >/dev/null 2>&1 || true
    fi
    docker buildx prune --builder "${buildx_builder}" --force --max-used-space 2gb >/dev/null 2>&1 || true
    fail "release image build failed and partial build output was cleaned up"
  fi

  docker buildx prune \
    --builder "${buildx_builder}" \
    --force \
    --max-used-space 2gb >/dev/null \
    || printf 'Warning: marketvalley Buildx cache pruning failed.\n' >&2
}

read_current_release() {
  local target=""
  if [[ -L "${current_link}" ]]; then
    target="$(readlink "${current_link}")"
    target="${target##*/}"
    is_release_sha "${target}" || fail "current release link is invalid"
    printf '%s' "${target}"
  fi
}

set_current_release() {
  local target_sha="$1"
  local temporary_link="${deploy_root}/.current.${target_sha}.$$"
  ln -s "releases/${target_sha}" "${temporary_link}"
  mv -Tf "${temporary_link}" "${current_link}"
}

write_previous_release() {
  local target_sha="$1"
  local temporary_file="${shared_directory}/.previous-release.$$"
  printf '%s\n' "${target_sha}" >"${temporary_file}"
  mv -f "${temporary_file}" "${previous_release_file}"
}

compose() {
  APP_IMAGE_TAG="${compose_tag}" \
  MARKETVALLEY_ENV_FILE="${production_environment}" \
  MARKETVALLEY_CADDYFILE="${shared_caddyfile}" \
    docker compose \
      --project-name marketvalley \
      --env-file "${production_environment}" \
      --file "${compose_file}" \
      "$@"
}

wait_for_healthy_app() {
  local expected_sha="$1"
  local container_id=""
  local health_status=""

  for _ in $(seq 1 45); do
    container_id="$(compose ps --quiet app 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      health_status="$(docker inspect --format '{{.State.Health.Status}}' "${container_id}" 2>/dev/null || true)"
      if [[ "${health_status}" == "healthy" ]]; then
        docker exec "${container_id}" node -e '
          const expected = process.argv[1];
          fetch("http://127.0.0.1:3000/api/health")
            .then(async (response) => {
              const body = await response.json();
              if (!response.ok || body.status !== "ok" || body.version !== expected) process.exit(1);
            })
            .catch(() => process.exit(1));
        ' "${expected_sha}"
        return
      fi
      [[ "${health_status}" != "unhealthy" ]] || return 1
    fi
    sleep 2
  done

  return 1
}

wait_for_running_lifecycle_worker() {
  local expected_sha="$1"
  local container_id=""
  local image=""
  local running=""

  for _ in $(seq 1 30); do
    container_id="$(compose ps --quiet lifecycle-worker 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      running="$(docker inspect --format '{{.State.Running}}' "${container_id}" 2>/dev/null || true)"
      image="$(docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null || true)"
      [[ "${running}" == "true" && "${image}" == "marketvalley:${expected_sha}" ]] && return
    fi
    sleep 2
  done

  return 1
}

activate_release() {
  local target_sha="$1"
  local release_directory="${releases_directory}/${target_sha}"

  [[ -f "${release_directory}/deploy/compose.production.yml" ]] || return 1
  [[ -f "${release_directory}/deploy/Caddyfile" ]] || return 1
  [[ -f "${release_directory}/deploy/runtime-contract" ]] || return 1
  [[ "$(<"${release_directory}/deploy/runtime-contract")" == "${required_release_contract}" ]] \
    || return 1
  docker image inspect "marketvalley:${target_sha}" >/dev/null 2>&1 || return 1

  if [[ -e "${shared_caddyfile}" ]]; then
    [[ -f "${shared_caddyfile}" && ! -L "${shared_caddyfile}" ]] || return 1
  else
    install -m 644 /dev/null "${shared_caddyfile}" || return 1
  fi
  cp -- "${release_directory}/deploy/Caddyfile" "${shared_caddyfile}" || return 1
  chmod 644 "${shared_caddyfile}" || return 1
  compose_file="${release_directory}/deploy/compose.production.yml"
  compose_tag="${target_sha}"

  compose up --detach --no-build app lifecycle-worker proxy || return 1
  wait_for_healthy_app "${target_sha}" || return 1
  compose up --detach --no-build --force-recreate lifecycle-worker || return 1
  wait_for_running_lifecycle_worker "${target_sha}" || return 1
  compose exec --no-TTY proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || return 1
}

validate_archive_paths() {
  local entry=""
  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    if [[ "${entry}" == /* || "${entry}" == ".." || "${entry}" == ../* || "${entry}" == */../* || "${entry}" == */.. ]]; then
      return 1
    fi
  done < <(tar -tzf "${archive_path}")

  tar -tvzf "${archive_path}" | awk 'substr($0, 1, 1) !~ /[-d]/ { exit 1 }' \
    || return 1
}

extract_release() {
  local release_sha="$1"
  local archive_digest="$2"
  local release_directory="${releases_directory}/${release_sha}"

  if [[ -e "${release_directory}" && ( ! -d "${release_directory}" || -L "${release_directory}" ) ]]; then
    fail "release directory is not a regular directory"
  fi

  if [[ ! -d "${release_directory}" ]]; then
    incoming_directory="${releases_directory}/.${release_sha}.incoming.$$"
    mkdir "${incoming_directory}"
    python3 /usr/local/lib/marketvalley/validate-release-archive.py "${archive_path}" "${incoming_directory}" \
      || fail "release archive violates extraction safety limits"
    for required_file in deploy/Dockerfile deploy/compose.production.yml deploy/Caddyfile deploy/runtime-contract; do
      [[ -f "${incoming_directory}/${required_file}" && ! -L "${incoming_directory}/${required_file}" ]] \
        || fail "release ${required_file} must be a regular file"
    done
    [[ "$(<"${incoming_directory}/deploy/runtime-contract")" == "${required_release_contract}" ]] \
      || fail "release runtime contract is incompatible with this server"
    validate_release_manifest "${release_sha}" "${archive_digest}" "${incoming_directory}" true
    mv "${incoming_directory}" "${release_directory}"
    incoming_directory=""
  else
    validate_release_manifest "${release_sha}" "${archive_digest}" "${release_directory}" false
  fi

  local releases_real="$(readlink -f "${releases_directory}")"
  local release_real="$(readlink -f "${release_directory}")"
  [[ "${release_real}" == "${releases_real}/${release_sha}" ]] \
    || fail "release directory escapes the managed releases root"
  for required_file in deploy/Dockerfile deploy/compose.production.yml deploy/Caddyfile deploy/runtime-contract; do
    [[ -f "${release_directory}/${required_file}" && ! -L "${release_directory}/${required_file}" ]] \
      || fail "release ${required_file} must be a regular file"
  done
  [[ "$(<"${release_directory}/deploy/runtime-contract")" == "${required_release_contract}" ]] \
    || fail "release runtime contract is incompatible with this server"
}

preflight_image() {
  local release_sha="$1"
  preflight_container="marketvalley-preflight-${release_sha:0:12}"
  docker rm --force "${preflight_container}" >/dev/null 2>&1 || true
  docker run \
    --detach \
    --rm \
    --name "${preflight_container}" \
    --init \
    --network none \
    --read-only \
    --tmpfs /tmp:size=64m,mode=1777 \
    --tmpfs /app/.next/cache:size=64m,uid=1001,gid=1001 \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    --cpus 0.75 \
    --memory 1536m \
    --memory-swap 1536m \
    --pids-limit 256 \
    --env-file "${production_environment}" \
    --env "APP_VERSION=${release_sha}" \
    --env HOSTNAME=0.0.0.0 \
    --env PORT=3000 \
    "marketvalley:${release_sha}" >/dev/null

  for _ in $(seq 1 30); do
    if docker exec "${preflight_container}" node -e '
      const expected = process.argv[1];
      fetch("http://127.0.0.1:3000/api/health")
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok || body.status !== "ok" || body.version !== expected) process.exit(1);
        })
        .catch(() => process.exit(1));
    ' "${release_sha}"; then
      [[ "$(docker exec "${preflight_container}" id -u)" == "1001" ]] || return 1
      docker stop --time 10 "${preflight_container}" >/dev/null
      preflight_container=""
      return
    fi
    sleep 2
  done

  return 1
}

preflight_external_dependencies() {
  local release_sha="$1"

  docker run \
    --rm \
    --init \
    --network bridge \
    --read-only \
    --tmpfs /tmp:size=32m,mode=1777 \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    --cpus 0.25 \
    --memory 256m \
    --pids-limit 64 \
    --env-file "${production_environment}" \
    "marketvalley:${release_sha}" \
    node /app/deploy/verify-external-dependencies.mjs
}

prune_old_releases() {
  local active_sha="$1"
  local rollback_sha="$2"
  local release_sha=""
  local index=0
  local -a release_shas=()
  local -A keep=()

  keep["${active_sha}"]=1
  if is_release_sha "${rollback_sha}"; then
    keep["${rollback_sha}"]=1
  fi

  mapfile -t release_shas < <(
    find "${releases_directory}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' \
      | sort -rn \
      | awk '{print $2}'
  )

  for release_sha in "${release_shas[@]}"; do
    is_release_sha "${release_sha}" || continue
    if (( index < 5 )); then
      keep["${release_sha}"]=1
    fi
    (( index += 1 ))
  done

  for release_sha in "${release_shas[@]}"; do
    is_release_sha "${release_sha}" || continue
    [[ -z "${keep[${release_sha}]:-}" ]] || continue

    rm -rf -- "${releases_directory:?}/${release_sha}"
    docker image rm "marketvalley:${release_sha}" >/dev/null 2>&1 || true
    docker volume rm "marketvalley_app_cache_${release_sha}" >/dev/null 2>&1 || true
    printf 'Pruned recoverable release %s from the server.\n' "${release_sha}"
  done
}

deploy_release() {
  local release_sha="${MARKETVALLEY_RELEASE_SHA:-}"
  local archive_digest="${MARKETVALLEY_ARCHIVE_SHA256:-}"
  local previous_sha=""
  local release_directory=""

  is_release_sha "${release_sha}" || fail "MARKETVALLEY_RELEASE_SHA must be a full Git SHA"
  [[ "${archive_digest}" =~ ^[0-9a-f]{64}$ ]] || fail "MARKETVALLEY_ARCHIVE_SHA256 is invalid"

  archive_path="${MARKETVALLEY_ARCHIVE_PATH:-}"
  [[ "${archive_path}" == "/tmp/marketvalley-${release_sha}.tar.gz" ]] || fail "release archive path is invalid"
  [[ -f "${archive_path}" && ! -L "${archive_path}" ]] || fail "release archive is missing or unsafe"
  printf '%s  %s\n' "${archive_digest}" "${archive_path}" | sha256sum --check --status \
    || fail "release archive checksum does not match"

  extract_release "${release_sha}" "${archive_digest}"
  release_directory="${releases_directory}/${release_sha}"
  compose_file="${release_directory}/deploy/compose.production.yml"
  compose_tag="${release_sha}"

  build_release_image "${release_sha}"
  preflight_image "${release_sha}" || fail "new image did not pass isolated health checks"
  preflight_external_dependencies "${release_sha}" \
    || fail "Anthropic or Supabase did not pass the external dependency preflight"

  previous_sha="$(read_current_release)"
  if ! activate_release "${release_sha}"; then
    printf 'New release failed after activation; attempting automatic rollback.\n' >&2
    if [[ -n "${previous_sha}" ]] && activate_release "${previous_sha}"; then
      set_current_release "${previous_sha}"
      printf 'Automatic rollback restored %s.\n' "${previous_sha}" >&2
    else
      printf 'Automatic rollback was not available or failed. Manual recovery is required.\n' >&2
    fi
    exit 1
  fi

  if [[ -n "${previous_sha}" && "${previous_sha}" != "${release_sha}" ]]; then
    write_previous_release "${previous_sha}"
  fi
  set_current_release "${release_sha}"
  prune_old_releases "${release_sha}" "${previous_sha}"
  printf 'marketvalley release %s is healthy.\n' "${release_sha}"
}

rollback_release() {
  local target_sha="${MARKETVALLEY_ROLLBACK_SHA:-}"
  local current_sha=""

  if [[ -z "${target_sha}" && -f "${previous_release_file}" ]]; then
    IFS= read -r target_sha <"${previous_release_file}"
  fi
  is_release_sha "${target_sha}" || fail "no valid rollback release is available"

  current_sha="$(read_current_release)"
  # A lost deploy ACK can leave the symlink updated while containers are not yet
  # serving. Re-activate even when the requested SHA already owns current.
  activate_release "${target_sha}" || fail "rollback release did not become healthy"

  if [[ -n "${current_sha}" ]]; then
    write_previous_release "${current_sha}"
  fi
  set_current_release "${target_sha}"
  printf 'marketvalley rollback restored %s.\n' "${target_sha}"
}

print_current_release() {
  local current_sha=""

  current_sha="$(read_current_release)"
  [[ -z "${current_sha}" || "${current_sha}" =~ ^[0-9a-f]{40}$ ]] \
    || fail "current release is invalid"
  printf '%s\n' "${current_sha}"
}

operation="${1:-deploy}"
case "${operation}" in
  deploy | rollback | current) ;;
  *) fail "usage: remote-release.sh [deploy|rollback|current]" ;;
esac

configure_rootless_runtime
require_runtime
validate_production_environment
acquire_deployment_lock "${operation}"

case "${operation}" in
  deploy)
    require_deploy_runtime
    deploy_release
    ;;
  rollback) rollback_release ;;
  current) print_current_release ;;
esac
