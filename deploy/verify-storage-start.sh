#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'marketvalley storage start check failed: %s\n' "$1" >&2
  exit 1
}

readonly storage_library="/usr/local/lib/marketvalley/storage-layout.sh"
[[ -f "${storage_library}" && ! -L "${storage_library}" ]] \
  || fail "trusted storage layout verification is unavailable"
[[ "$(stat -c '%u:%g:%a' "${storage_library}")" == "0:0:644" ]] \
  || fail "trusted storage layout verification must be root-owned mode 0644"
# shellcheck disable=SC1091
. "${storage_library}"
marketvalley_verify_storage_layout >/dev/null
