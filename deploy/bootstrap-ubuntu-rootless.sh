#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly docker_engine_version="29.7.2"
readonly docker_cli_package_version="5:29.7.2-1~ubuntu.22.04~jammy"
readonly docker_buildx_package_version="0.36.1-1~ubuntu.22.04~jammy"
readonly docker_compose_package_version="5.5.0-1~ubuntu.22.04~jammy"
readonly docker_rootless_package_version="5:29.7.2-1~ubuntu.22.04~jammy"
readonly docker_archive_sha256="43d143448adf2c2787704e7d7704fd6d62d367a54c5edaef0a3f75509cb0938d"
readonly docker_gpg_sha256="1500c1f56fa9e26b9b8f42452a553675796ade0807cdce11975eb98170b3a570"

temporary_directory=""
storage_marker_temporary=""

fail() {
  printf 'marketvalley rootless bootstrap error: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "${storage_marker_temporary}" \
    && "${storage_marker_temporary}" == /etc/.marketvalley-storage-layout.* ]]; then
    rm -f -- "${storage_marker_temporary}"
  fi
  if [[ -n "${temporary_directory}" && "${temporary_directory}" == /tmp/marketvalley-rootless.* ]]; then
    rm -rf -- "${temporary_directory}"
  fi
}
trap cleanup EXIT

[[ "$(id -u)" -eq 0 ]] || fail "run this script as root"
[[ -r /etc/os-release ]] || fail "/etc/os-release is missing"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "22.04" ]] \
  || fail "this pinned bootstrap supports Ubuntu 22.04 only"
[[ "$(dpkg --print-architecture)" == "arm64" ]] \
  || fail "this pinned bootstrap supports the Oracle A1 arm64 host only"

deploy_user="${MARKETVALLEY_DEPLOY_USER:-marketvalley}"
public_key_file="${MARKETVALLEY_DEPLOY_PUBLIC_KEY_FILE:-}"
deploy_marker="/etc/marketvalley-deploy-user"
[[ "${deploy_user}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "deploy user name is invalid"
[[ -n "${public_key_file}" && "${public_key_file}" == /* ]] \
  || fail "MARKETVALLEY_DEPLOY_PUBLIC_KEY_FILE must be an absolute path"
[[ -f "${public_key_file}" && ! -L "${public_key_file}" ]] || fail "deploy public key file is missing or unsafe"
ssh-keygen -l -f "${public_key_file}" >/dev/null || fail "deploy public key is invalid"
[[ "$(awk 'NF { count += 1; type = $1; fields = NF } END { print count ":" type ":" fields }' "${public_key_file}")" == "1:ssh-ed25519:3" ]] \
  || fail "deploy public key must contain exactly one Ed25519 public key"
deploy_public_key="$(<"${public_key_file}")"
restricted_authorized_key="restrict,command=\"/usr/local/lib/marketvalley/deploy-gateway.sh\" ${deploy_public_key}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes ca-certificates curl dbus-user-session e2fsprogs fuse-overlayfs python3-minimal uidmap util-linux slirp4netns
python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' \
  || fail "Python 3.10 or newer is required for safe release extraction"

temporary_directory="$(mktemp -d /tmp/marketvalley-rootless.XXXXXX)"
curl --fail --location --proto '=https' --tlsv1.2 \
  https://download.docker.com/linux/ubuntu/gpg \
  --output "${temporary_directory}/docker.asc"
printf '%s  %s\n' "${docker_gpg_sha256}" "${temporary_directory}/docker.asc" \
  | sha256sum --check --status \
  || fail "Docker apt signing key checksum changed"
install -d -m 0755 /etc/apt/keyrings
install -m 0644 "${temporary_directory}/docker.asc" /etc/apt/keyrings/docker.asc
printf '%s\n' \
  'Types: deb' \
  'URIs: https://download.docker.com/linux/ubuntu' \
  'Suites: jammy' \
  'Components: stable' \
  'Architectures: arm64' \
  'Signed-By: /etc/apt/keyrings/docker.asc' \
  >"${temporary_directory}/docker.sources"
install -m 0644 "${temporary_directory}/docker.sources" /etc/apt/sources.list.d/docker.sources

apt-get update
apt-get install --yes \
  "docker-ce-cli=${docker_cli_package_version}" \
  "docker-buildx-plugin=${docker_buildx_package_version}" \
  "docker-compose-plugin=${docker_compose_package_version}" \
  "docker-ce-rootless-extras=${docker_rootless_package_version}"

if id "${deploy_user}" >/dev/null 2>&1; then
  [[ -f "${deploy_marker}" && ! -L "${deploy_marker}" ]] \
    || fail "refusing an unmarked existing deploy user"
  [[ "$(<"${deploy_marker}")" == "${deploy_user}" ]] \
    || fail "existing deploy user marker does not match"
else
  [[ ! -e "${deploy_marker}" && ! -L "${deploy_marker}" ]] \
    || fail "deploy user marker exists before user creation"
  useradd --create-home --shell /bin/bash "${deploy_user}"
  install -m 0644 /dev/null "${deploy_marker}"
  printf '%s\n' "${deploy_user}" >"${deploy_marker}"
fi
deploy_uid="$(id -u "${deploy_user}")"
deploy_home="$(getent passwd "${deploy_user}" | awk -F: '{print $6}')"
[[ "${deploy_uid}" != "0" && -d "${deploy_home}" && ! -L "${deploy_home}" ]] \
  || fail "deploy user home is missing or unsafe"
for privileged_group in adm docker lxd libvirt root sudo systemd-journal; do
  id -nG "${deploy_user}" | tr ' ' '\n' | grep -Fx "${privileged_group}" >/dev/null \
    && fail "deploy user must not be a member of privileged group ${privileged_group}"
done
if grep -R -E --include='*' "(^|[[:space:]])${deploy_user}([[:space:]]|$)" /etc/sudoers /etc/sudoers.d 2>/dev/null | grep -q .; then
  fail "deploy user must not have a sudoers entry"
fi
awk -F: -v user="${deploy_user}" '$1 == user && $3 >= 65536 { found = 1 } END { exit !found }' /etc/subuid \
  || fail "deploy user needs at least 65536 subordinate UIDs"
awk -F: -v user="${deploy_user}" '$1 == user && $3 >= 65536 { found = 1 } END { exit !found }' /etc/subgid \
  || fail "deploy user needs at least 65536 subordinate GIDs"

storage_mode="${MARKETVALLEY_STORAGE_MODE:-dedicated-volume-v1}"
data_mount="/opt/marketvalley"
script_directory="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${script_directory}/storage-layout.sh"

case "${storage_mode}" in
  dedicated-volume-v1)
    data_device="${MARKETVALLEY_DATA_DEVICE:-/dev/oracleoci/oraclevdb}"
    [[ "${data_device}" =~ ^/dev/oracleoci/oraclevd[b-z]$ ]] \
      || fail "MARKETVALLEY_DATA_DEVICE must be a non-boot OCI consistent device path"
    [[ -b "${data_device}" ]] || fail "the dedicated marketvalley block device is unavailable"
    device_real="$(readlink -f "${data_device}")"
    boot_device_real="$(readlink -f /dev/oracleoci/oraclevda)"
    [[ -b "${device_real}" && "${device_real}" != "${boot_device_real}" ]] \
      || fail "refusing to format the boot device"
    [[ "$(lsblk -dn -o TYPE "${device_real}")" == "disk" ]] \
      || fail "the marketvalley data device must be a whole disk"
    [[ "$(lsblk -nr -o NAME "${device_real}" | wc -l | tr -d '[:space:]')" == "1" ]] \
      || fail "the marketvalley data device must not contain partitions"
    device_size_bytes="$(blockdev --getsize64 "${device_real}")"
    (( device_size_bytes >= 50 * 1024 * 1024 * 1024 && device_size_bytes <= 150 * 1024 * 1024 * 1024 )) \
      || fail "the marketvalley data volume must be between 50 and 150 GiB"

    filesystem_type="$(blkid -s TYPE -o value "${device_real}" 2>/dev/null || true)"
    filesystem_label="$(blkid -s LABEL -o value "${device_real}" 2>/dev/null || true)"
    if [[ -z "${filesystem_type}" ]]; then
      [[ "${MARKETVALLEY_CONFIRM_FORMAT_DEVICE:-}" == "yes" ]] \
        || fail "set MARKETVALLEY_CONFIRM_FORMAT_DEVICE=yes to format the empty dedicated volume"
      mkfs.ext4 -F -L marketvalley -m 0 "${device_real}"
      filesystem_type="$(blkid -s TYPE -o value "${device_real}")"
      filesystem_label="$(blkid -s LABEL -o value "${device_real}")"
    fi
    [[ "${filesystem_type}" == "ext4" && "${filesystem_label}" == "marketvalley" ]] \
      || fail "the data device contains an unexpected filesystem"
    filesystem_uuid="$(blkid -s UUID -o value "${device_real}")"
    [[ "${filesystem_uuid}" =~ ^[0-9a-fA-F-]{16,64}$ ]] || fail "the data filesystem UUID is invalid"

    install -d -m 0750 -o "${deploy_user}" -g "${deploy_user}" "${data_mount}"
    if ! mountpoint -q "${data_mount}"; then
      [[ -z "$(find "${data_mount}" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
        || fail "the unmounted marketvalley data directory is not empty"
      fstab_entry="UUID=${filesystem_uuid} ${data_mount} ext4 defaults,_netdev,nofail,nodev,nosuid,noatime 0 2"
      existing_mount_entries="$(awk -v mount_path="${data_mount}" '$2 == mount_path { print }' /etc/fstab)"
      if [[ -n "${existing_mount_entries}" && "${existing_mount_entries}" != "${fstab_entry}" ]]; then
        fail "an unexpected /opt/marketvalley fstab entry already exists"
      fi
      if [[ -z "${existing_mount_entries}" ]]; then
        printf '%s\n' "${fstab_entry}" >>/etc/fstab
      fi
      mount "${data_mount}"
    fi
    [[ "$(findmnt -n -o UUID --target "${data_mount}")" == "${filesystem_uuid}" ]] \
      || fail "an unexpected filesystem is mounted at /opt/marketvalley"
    storage_marker_temporary="$(mktemp /etc/.marketvalley-storage-layout.XXXXXX)"
    printf '%s\n' 'dedicated-volume-v1' >"${storage_marker_temporary}"
    chown root:root "${storage_marker_temporary}"
    chmod 0644 "${storage_marker_temporary}"
    mv -- "${storage_marker_temporary}" "${MARKETVALLEY_STORAGE_MARKER}"
    storage_marker_temporary=""
    ;;
  boot-bind-v1)
    [[ "${MARKETVALLEY_CONFIRM_BOOT_BIND:-}" == "yes" ]] \
      || fail "set MARKETVALLEY_CONFIRM_BOOT_BIND=yes only after the reviewed storage cutover"
    ;;
  *)
    fail "MARKETVALLEY_STORAGE_MODE must be dedicated-volume-v1 or boot-bind-v1"
    ;;
esac

[[ "$(marketvalley_verify_storage_layout)" == "${storage_mode}" ]] \
  || fail "the mounted storage layout does not match MARKETVALLEY_STORAGE_MODE"
marketvalley_require_storage_capacity "${storage_mode}"
chown "${deploy_user}:${deploy_user}" "${data_mount}"
chmod 0750 "${data_mount}"

docker_config_directory="${deploy_home}/.config/docker"
docker_daemon_config="${docker_config_directory}/daemon.json"
install -d -m 0700 -o "${deploy_user}" -g "${deploy_user}" \
  "${deploy_home}/.config" "${docker_config_directory}" "${data_mount}/docker"
chown "${deploy_user}:${deploy_user}" "${data_mount}/docker"
if [[ -e "${docker_daemon_config}" ]]; then
  [[ -f "${docker_daemon_config}" && ! -L "${docker_daemon_config}" ]] \
    || fail "the rootless Docker daemon config is unsafe"
  python3 -c 'import json, sys; raise SystemExit(json.load(open(sys.argv[1])) != {"data-root": "/opt/marketvalley/docker"})' \
    "${docker_daemon_config}" || fail "the rootless Docker daemon config is unexpected"
else
  printf '%s\n' '{"data-root":"/opt/marketvalley/docker"}' >"${docker_daemon_config}"
  chown "${deploy_user}:${deploy_user}" "${docker_daemon_config}"
  chmod 0600 "${docker_daemon_config}"
fi

install -d -m 0700 -o "${deploy_user}" -g "${deploy_user}" "${deploy_home}/.ssh" "${deploy_home}/bin"
authorized_keys="${deploy_home}/.ssh/authorized_keys"
if [[ -e "${authorized_keys}" ]]; then
  [[ -f "${authorized_keys}" && ! -L "${authorized_keys}" ]] || fail "authorized_keys is unsafe"
  [[ "$(grep -cv '^[[:space:]]*$' "${authorized_keys}")" -eq 1 ]] \
    && grep -Fqx -- "${restricted_authorized_key}" "${authorized_keys}" \
    || fail "refusing unknown or additional deploy SSH keys"
else
  install -m 0600 -o "${deploy_user}" -g "${deploy_user}" /dev/null "${authorized_keys}"
  printf '%s\n' "${restricted_authorized_key}" >"${authorized_keys}"
fi
chown "${deploy_user}:${deploy_user}" "${authorized_keys}"
chmod 0600 "${authorized_keys}"

docker_archive="${temporary_directory}/docker-${docker_engine_version}.tgz"
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://download.docker.com/linux/static/stable/aarch64/docker-${docker_engine_version}.tgz" \
  --output "${docker_archive}"
printf '%s  %s\n' "${docker_archive_sha256}" "${docker_archive}" \
  | sha256sum --check --status \
  || fail "Docker engine archive checksum changed"
tar -xzf "${docker_archive}" -C "${temporary_directory}"
for binary in containerd containerd-shim-runc-v2 ctr docker-init docker-proxy dockerd runc; do
  install -m 0755 -o "${deploy_user}" -g "${deploy_user}" \
    "${temporary_directory}/docker/${binary}" "${deploy_home}/bin/${binary}"
done

delegate_directory="/etc/systemd/system/user@${deploy_uid}.service.d"
install -d -m 0755 "${delegate_directory}"
printf '%s\n' \
  '[Service]' \
  'Delegate=cpu cpuset io memory pids' \
  'CPUAccounting=true' \
  'MemoryAccounting=true' \
  'TasksAccounting=true' \
  'IOAccounting=true' \
  'CPUQuota=125%' \
  'MemoryMax=3G' \
  'MemorySwapMax=0' \
  'TasksMax=1024' \
  'IOWeight=100' \
  >"${temporary_directory}/delegate.conf"
install -m 0644 "${temporary_directory}/delegate.conf" "${delegate_directory}/delegate.conf"
systemctl daemon-reload
loginctl enable-linger "${deploy_user}"

runtime_directory="/run/user/${deploy_uid}"
for _ in $(seq 1 20); do
  [[ -S "${runtime_directory}/bus" ]] && break
  sleep 1
done
[[ -S "${runtime_directory}/bus" ]] || fail "deploy user systemd bus did not start"

run_as_deploy() {
  runuser --user "${deploy_user}" -- \
    env \
      "DBUS_SESSION_BUS_ADDRESS=unix:path=${runtime_directory}/bus" \
      "HOME=${deploy_home}" \
      "LOGNAME=${deploy_user}" \
      "PATH=${deploy_home}/bin:/usr/local/bin:/usr/bin:/bin" \
      "USER=${deploy_user}" \
      "XDG_RUNTIME_DIR=${runtime_directory}" \
      "$@"
}

run_as_deploy dockerd-rootless-setuptool.sh install --force
install -d -m 0755 /usr/local/lib/marketvalley
install -m 0644 -o root -g root "${script_directory}/storage-layout.sh" \
  /usr/local/lib/marketvalley/storage-layout.sh
install -m 0755 -o root -g root "${script_directory}/verify-storage-start.sh" \
  /usr/local/lib/marketvalley/verify-storage-start.sh
install -d -m 0755 -o "${deploy_user}" -g "${deploy_user}" \
  "${deploy_home}/.config/systemd/user/docker.service.d"
printf '%s\n' \
  '[Unit]' \
  'ConditionPathIsMountPoint=/opt/marketvalley' \
  '[Service]' \
  'ExecStartPre=/usr/local/lib/marketvalley/verify-storage-start.sh' \
  >"${deploy_home}/.config/systemd/user/docker.service.d/marketvalley-data.conf"
chown "${deploy_user}:${deploy_user}" \
  "${deploy_home}/.config/systemd/user/docker.service.d/marketvalley-data.conf"
run_as_deploy systemctl --user daemon-reload
run_as_deploy systemctl --user enable --now docker.service
[[ "$(run_as_deploy docker info --format '{{.DockerRootDir}}')" == "/opt/marketvalley/docker" ]] \
  || fail "rootless Docker data-root is outside the dedicated volume"

install -m 0755 -o root -g root "${script_directory}/deploy-gateway.sh" \
  /usr/local/lib/marketvalley/deploy-gateway.sh
install -m 0755 -o root -g root "${script_directory}/release-manager.sh" \
  /usr/local/lib/marketvalley/release-manager.sh
install -m 0755 -o root -g root "${script_directory}/remote-release.sh" \
  /usr/local/lib/marketvalley/remote-release.sh
install -m 0755 -o root -g root "${script_directory}/validate-release-archive.py" \
  /usr/local/lib/marketvalley/validate-release-archive.py
MARKETVALLEY_DEPLOY_USER="${deploy_user}" bash "${script_directory}/prepare-host.sh"

printf 'Pinned rootless Docker %s is ready for %s without a rootful Docker daemon.\n' \
  "${docker_engine_version}" "${deploy_user}"
