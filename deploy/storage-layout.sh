#!/usr/bin/env bash

# This file is sourced by root-owned bootstrap scripts and by the unprivileged
# release process. Keep it side-effect free and fail closed through the caller's
# fail() function.

readonly MARKETVALLEY_STORAGE_MARKER="/etc/marketvalley-storage-layout"
readonly MARKETVALLEY_BOOT_SOURCE="/var/lib/marketvalley"
readonly MARKETVALLEY_STORAGE_TARGET="/opt/marketvalley"
readonly MARKETVALLEY_BOOT_MINIMUM_FREE_KIB=$((40 * 1024 * 1024))
readonly MARKETVALLEY_DEDICATED_MINIMUM_FREE_KIB=$((5 * 1024 * 1024))
readonly MARKETVALLEY_MAXIMUM_INODE_USE_PERCENT=90

marketvalley_storage_fail() {
  fail "$1"
}

marketvalley_read_storage_mode() {
  local target_major_minor=""
  local root_major_minor=""

  if [[ -e "${MARKETVALLEY_STORAGE_MARKER}" || -L "${MARKETVALLEY_STORAGE_MARKER}" ]]; then
    [[ -f "${MARKETVALLEY_STORAGE_MARKER}" && ! -L "${MARKETVALLEY_STORAGE_MARKER}" ]] \
      || marketvalley_storage_fail "the storage layout marker is unsafe"
    [[ "$(stat -c '%u:%g:%a' "${MARKETVALLEY_STORAGE_MARKER}")" == "0:0:644" ]] \
      || marketvalley_storage_fail "the storage layout marker must be root-owned mode 0644"
    cat "${MARKETVALLEY_STORAGE_MARKER}"
    return
  fi

  target_major_minor="$(findmnt -n -o MAJ:MIN --target "${MARKETVALLEY_STORAGE_TARGET}")"
  root_major_minor="$(findmnt -n -o MAJ:MIN --target /)"
  [[ -n "${target_major_minor}" && "${target_major_minor}" != "${root_major_minor}" ]] \
    || marketvalley_storage_fail "an unmarked storage layout is only accepted for the legacy dedicated volume"
  printf '%s\n' 'dedicated-volume-v1'
}

marketvalley_require_storage_capacity() {
  local mode="$1"
  local available_kib=0
  local inode_use_percent=0
  local minimum_free_kib=0
  local capacity_path="${MARKETVALLEY_STORAGE_TARGET}"

  case "${mode}" in
    dedicated-volume-v1)
      minimum_free_kib="${MARKETVALLEY_DEDICATED_MINIMUM_FREE_KIB}"
      ;;
    boot-bind-v1)
      minimum_free_kib="${MARKETVALLEY_BOOT_MINIMUM_FREE_KIB}"
      capacity_path="/"
      ;;
    *)
      marketvalley_storage_fail "the storage layout marker has an unsupported value"
      ;;
  esac

  available_kib="$(df -Pk "${capacity_path}" | awk 'NR == 2 { print $4 }')"
  [[ "${available_kib}" =~ ^[0-9]+$ && "${available_kib}" -ge "${minimum_free_kib}" ]] \
    || marketvalley_storage_fail "the ${mode} layout requires at least $((minimum_free_kib / 1024 / 1024)) GiB free"

  inode_use_percent="$(df -Pi "${capacity_path}" | awk 'NR == 2 { value = $5; sub(/%$/, "", value); print value }')"
  [[ "${inode_use_percent}" =~ ^[0-9]+$ && "${inode_use_percent}" -le "${MARKETVALLEY_MAXIMUM_INODE_USE_PERCENT}" ]] \
    || marketvalley_storage_fail "the ${mode} layout must keep inode use at or below ${MARKETVALLEY_MAXIMUM_INODE_USE_PERCENT}%"
}

marketvalley_verify_storage_layout() {
  local mode=""
  local target_major_minor=""
  local root_major_minor=""
  local filesystem_root=""
  local vfs_options=""

  for command_name in awk cat df findmnt stat; do
    command -v "${command_name}" >/dev/null 2>&1 \
      || marketvalley_storage_fail "${command_name} is required to verify storage"
  done

  [[ -d "${MARKETVALLEY_STORAGE_TARGET}" && ! -L "${MARKETVALLEY_STORAGE_TARGET}" ]] \
    || marketvalley_storage_fail "${MARKETVALLEY_STORAGE_TARGET} is missing or unsafe"
  [[ "$(findmnt -n -o TARGET --target "${MARKETVALLEY_STORAGE_TARGET}")" == "${MARKETVALLEY_STORAGE_TARGET}" ]] \
    || marketvalley_storage_fail "${MARKETVALLEY_STORAGE_TARGET} must be an exact mount point"
  [[ "$(findmnt -n -o FSTYPE --target "${MARKETVALLEY_STORAGE_TARGET}")" == "ext4" ]] \
    || marketvalley_storage_fail "${MARKETVALLEY_STORAGE_TARGET} must use ext4"

  vfs_options=",$(findmnt -n -o VFS-OPTIONS --target "${MARKETVALLEY_STORAGE_TARGET}"),"
  [[ "${vfs_options}" == *,nosuid,* && "${vfs_options}" == *,nodev,* ]] \
    || marketvalley_storage_fail "${MARKETVALLEY_STORAGE_TARGET} must be mounted nosuid,nodev"

  mode="$(marketvalley_read_storage_mode)"
  target_major_minor="$(findmnt -n -o MAJ:MIN --target "${MARKETVALLEY_STORAGE_TARGET}")"
  root_major_minor="$(findmnt -n -o MAJ:MIN --target /)"
  filesystem_root="$(findmnt -n -o FSROOT --target "${MARKETVALLEY_STORAGE_TARGET}")"

  case "${mode}" in
    dedicated-volume-v1)
      [[ "${target_major_minor}" != "${root_major_minor}" && "${filesystem_root}" == "/" ]] \
        || marketvalley_storage_fail "the dedicated layout must use a separate whole filesystem"
      ;;
    boot-bind-v1)
      [[ -d "${MARKETVALLEY_BOOT_SOURCE}" && ! -L "${MARKETVALLEY_BOOT_SOURCE}" ]] \
        || marketvalley_storage_fail "the boot-backed storage source is missing or unsafe"
      [[ "${target_major_minor}" == "${root_major_minor}" && "${filesystem_root}" == "${MARKETVALLEY_BOOT_SOURCE}" ]] \
        || marketvalley_storage_fail "the boot-backed layout must bind the exact approved source from the root filesystem"
      [[ "$(stat -c '%d:%i' "${MARKETVALLEY_BOOT_SOURCE}")" == "$(stat -c '%d:%i' "${MARKETVALLEY_STORAGE_TARGET}")" ]] \
        || marketvalley_storage_fail "the boot-backed source and target do not identify the same directory"
      [[ "$(stat -c '%d' "${MARKETVALLEY_BOOT_SOURCE}")" == "$(stat -c '%d' /)" ]] \
        || marketvalley_storage_fail "the boot-backed source is not on the root filesystem"
      ;;
    *)
      marketvalley_storage_fail "the storage layout marker has an unsupported value"
      ;;
  esac

  printf '%s\n' "${mode}"
}
