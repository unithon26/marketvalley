#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'marketvalley host preparation error: %s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "run this script as root"

deploy_user="${MARKETVALLEY_DEPLOY_USER:-}"
[[ "${deploy_user}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "MARKETVALLEY_DEPLOY_USER is required"
id "${deploy_user}" >/dev/null 2>&1 || fail "deploy user does not exist"

deploy_uid="$(id -u "${deploy_user}")"
deploy_home="$(getent passwd "${deploy_user}" | awk -F: '{print $6}')"
runtime_directory="/run/user/${deploy_uid}"
rootless_socket="${runtime_directory}/docker.sock"
user_cgroup="/sys/fs/cgroup/user.slice/user-${deploy_uid}.slice/user@${deploy_uid}.service"

[[ "${deploy_uid}" != "0" ]] || fail "deploy user must not be root"
[[ -d "${deploy_home}" && ! -L "${deploy_home}" ]] || fail "deploy user home is missing or unsafe"
for command_name in awk chmod chown findmnt getent grep id install loginctl runuser stat systemctl tr; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is not installed"
done

id -nG "${deploy_user}" | tr ' ' '\n' | grep -Fx docker >/dev/null \
  && fail "deploy user must not be a member of the rootful docker group"
awk -F: -v user="${deploy_user}" '$1 == user && $3 >= 65536 { found = 1 } END { exit !found }' /etc/subuid \
  || fail "deploy user needs at least 65536 subordinate UIDs in /etc/subuid"
awk -F: -v user="${deploy_user}" '$1 == user && $3 >= 65536 { found = 1 } END { exit !found }' /etc/subgid \
  || fail "deploy user needs at least 65536 subordinate GIDs in /etc/subgid"
[[ "$(loginctl show-user "${deploy_user}" --property=Linger --value)" == "yes" ]] \
  || fail "enable systemd lingering for the deploy user"
[[ -S "${rootless_socket}" ]] || fail "rootless Docker socket is unavailable"
[[ "$(stat -c '%u' "${rootless_socket}")" == "${deploy_uid}" ]] \
  || fail "rootless Docker socket is not owned by the deploy user"
[[ -r "${user_cgroup}/cgroup.controllers" ]] || fail "deploy user cgroup v2 controllers are unavailable"
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
[[ -r "${user_cgroup}/io.weight" ]] || fail "deploy user aggregate I/O accounting is unavailable"
script_directory="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
storage_library="/usr/local/lib/marketvalley/storage-layout.sh"
[[ -r "${storage_library}" ]] || storage_library="${script_directory}/storage-layout.sh"
[[ -f "${storage_library}" && ! -L "${storage_library}" ]] || fail "trusted storage layout library is unavailable"
[[ "$(stat -c '%u:%g:%a' "${storage_library}")" == "0:0:644" ]] \
  || fail "trusted storage layout library must be root-owned mode 0644"
# shellcheck disable=SC1090
. "${storage_library}"
storage_mode="$(marketvalley_verify_storage_layout)"
marketvalley_require_storage_capacity "${storage_mode}"

run_as_deploy() {
  runuser --user "${deploy_user}" -- \
    env \
      "DBUS_SESSION_BUS_ADDRESS=unix:path=${runtime_directory}/bus" \
      "DOCKER_HOST=unix://${rootless_socket}" \
      "HOME=${deploy_home}" \
      "LOGNAME=${deploy_user}" \
      "PATH=${deploy_home}/bin:/usr/local/bin:/usr/bin:/bin" \
      "USER=${deploy_user}" \
      "XDG_RUNTIME_DIR=${runtime_directory}" \
      "$@"
}

run_as_deploy systemctl --user is-enabled docker.service >/dev/null \
  || fail "rootless docker.service is not enabled"
run_as_deploy systemctl --user is-active docker.service >/dev/null \
  || fail "rootless docker.service is not active"
run_as_deploy docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not installed"
run_as_deploy docker buildx version >/dev/null 2>&1 || fail "Docker Buildx is not installed"
security_options="$(run_as_deploy docker info --format '{{json .SecurityOptions}}')" \
  || fail "rootless Docker daemon is unavailable"
[[ "${security_options}" == *rootless* ]] || fail "Docker daemon is not running in rootless mode"
[[ "$(run_as_deploy docker info --format '{{.CgroupVersion}}')" == "2" ]] \
  || fail "rootless resource limits require cgroup v2"
[[ "$(run_as_deploy docker info --format '{{.CgroupDriver}}')" == "systemd" ]] \
  || fail "rootless resource limits require the systemd cgroup driver"
[[ "$(run_as_deploy docker info --format '{{.DockerRootDir}}')" == "/opt/marketvalley/docker" ]] \
  || fail "rootless Docker data-root is outside the dedicated volume"
[[ "$(run_as_deploy docker buildx prune --help)" == *"--max-used-space"* ]] \
  || fail "Docker Buildx must support project-scoped cache limits"

template_path="${script_directory}/production.env.example"
deploy_root="/opt/marketvalley"
shared_directory="${deploy_root}/shared"
environment_path="${shared_directory}/production.env"

[[ -f "${template_path}" ]] || fail "production.env.example is missing"

install -d -m 0750 -o "${deploy_user}" -g "${deploy_user}" "${deploy_root}"
install -d -m 0750 -o "${deploy_user}" -g "${deploy_user}" \
  "${deploy_root}/releases" "${shared_directory}"

if [[ ! -e "${environment_path}" ]]; then
  install -m 0600 -o "${deploy_user}" -g "${deploy_user}" \
    "${template_path}" "${environment_path}"
  printf 'Created %s from the placeholder template. Replace every placeholder before deployment.\n' \
    "${environment_path}"
else
  [[ -f "${environment_path}" && ! -L "${environment_path}" ]] \
    || fail "existing production.env is not a regular file"
  chown "${deploy_user}:${deploy_user}" "${environment_path}"
  chmod 0600 "${environment_path}"
  printf 'Preserved existing %s and corrected its owner and mode.\n' "${environment_path}"
fi

printf 'Rootless host directories are ready for deploy user %s.\n' "${deploy_user}"
