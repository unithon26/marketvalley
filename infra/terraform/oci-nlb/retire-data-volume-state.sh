#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly volume_address="oci_core_volume.marketvalley_data"
readonly attachment_address="oci_core_volume_attachment.marketvalley_data"

fail() {
  printf 'marketvalley state retirement error: %s\n' "$1" >&2
  exit 1
}

portable_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

input_state="${1:-}"
output_state="${2:-}"
[[ -n "${input_state}" && -n "${output_state}" ]] \
  || fail "usage: retire-data-volume-state.sh /absolute/downloaded.tfstate /absolute/import.tfstate"
[[ "${input_state}" == /* && "${output_state}" == /* ]] \
  || fail "state paths must be absolute"
[[ -f "${input_state}" && ! -L "${input_state}" ]] \
  || fail "downloaded state must be a regular non-symlink file"
[[ "$(portable_mode "${input_state}")" == "600" ]] \
  || fail "downloaded state must be mode 0600"
[[ ! -e "${output_state}" && ! -L "${output_state}" ]] \
  || fail "output state path must not already exist"

for command_name in chmod cmp diff dirname grep install mktemp python3 rm sort stat; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is required"
done

terraform_binary="${TERRAFORM_1_5_7_BIN:-}"
[[ "${terraform_binary}" == /* && -f "${terraform_binary}" && -x "${terraform_binary}" \
  && ! -L "${terraform_binary}" ]] \
  || fail "TERRAFORM_1_5_7_BIN must name an absolute executable non-symlink file"
terraform_version="$(
  "${terraform_binary}" version -json \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["terraform_version"])'
)"
[[ "${terraform_version}" == "1.5.7" ]] \
  || fail "Terraform 1.5.7 is required for OCI Resource Manager state compatibility"

output_directory="$(dirname -- "${output_state}")"
[[ -d "${output_directory}" && ! -L "${output_directory}" ]] \
  || fail "output state directory is missing or unsafe"
backup_state="${output_state}.pre-retirement"
[[ ! -e "${backup_state}" && ! -L "${backup_state}" ]] \
  || fail "backup state path must not already exist"

temporary_directory="$(mktemp -d /tmp/marketvalley-state-retirement.XXXXXX)"
cleanup() {
  if [[ -n "${temporary_directory:-}" \
    && "${temporary_directory}" == /tmp/marketvalley-state-retirement.* ]]; then
    rm -rf -- "${temporary_directory}"
  fi
}
trap cleanup EXIT

before_addresses="${temporary_directory}/before"
expected_addresses="${temporary_directory}/expected"
after_addresses="${temporary_directory}/after"
terraform_backup="${temporary_directory}/terraform.backup"
"${terraform_binary}" state list -state="${input_state}" | sort >"${before_addresses}"
[[ "$(grep -Fxc "${volume_address}" "${before_addresses}" || true)" == "1" ]] \
  || fail "downloaded state must contain exactly one marketvalley data volume"
[[ "$(grep -Fxc "${attachment_address}" "${before_addresses}" || true)" == "1" ]] \
  || fail "downloaded state must contain exactly one marketvalley data attachment"

install -m 0600 "${input_state}" "${backup_state}"
install -m 0600 "${input_state}" "${output_state}"
"${terraform_binary}" state rm -dry-run -state="${output_state}" \
  "${attachment_address}" "${volume_address}" >/dev/null
"${terraform_binary}" state rm -state="${output_state}" -backup="${terraform_backup}" \
  "${attachment_address}" "${volume_address}" >/dev/null
chmod 0600 "${output_state}" "${backup_state}"
cmp -s "${input_state}" "${backup_state}" \
  || fail "Terraform backup does not match the downloaded source state"

grep -Fvx "${volume_address}" "${before_addresses}" \
  | grep -Fvx "${attachment_address}" >"${expected_addresses}"
"${terraform_binary}" state list -state="${output_state}" | sort >"${after_addresses}"
diff -u "${expected_addresses}" "${after_addresses}" >/dev/null \
  || fail "state retirement changed addresses outside the approved volume pair"

printf 'Prepared a mode-0600 import state and byte-identical pre-retirement backup; no OCI resource was changed.\n'
