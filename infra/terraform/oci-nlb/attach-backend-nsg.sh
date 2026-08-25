#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'marketvalley NSG attachment error: %s\n' "$1" >&2
  exit 1
}

for command_name in jq oci; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is not installed"
done

vnic_id="${MARKETVALLEY_VNIC_ID:-}"
backend_nsg_id="${MARKETVALLEY_BACKEND_NSG_ID:-}"
expected_private_ip="${MARKETVALLEY_EXPECTED_PRIVATE_IP:-10.0.0.9}"
backup_file="${MARKETVALLEY_NSG_BACKUP_FILE:-}"
[[ "${vnic_id}" == ocid1.vnic.* ]] || fail "MARKETVALLEY_VNIC_ID is invalid"
[[ "${backend_nsg_id}" == ocid1.networksecuritygroup.* ]] \
  || fail "MARKETVALLEY_BACKEND_NSG_ID is invalid"
[[ "${backup_file}" == /* ]] || fail "MARKETVALLEY_NSG_BACKUP_FILE must be an absolute path"
[[ ! -e "${backup_file}" && ! -L "${backup_file}" ]] \
  || fail "MARKETVALLEY_NSG_BACKUP_FILE must not already exist"
[[ -d "$(dirname -- "${backup_file}")" ]] || fail "backup directory does not exist"

vnic_json="$(oci network vnic get --vnic-id "${vnic_id}")"
nsg_json="$(oci network nsg get --nsg-id "${backend_nsg_id}")"
actual_private_ip="$(jq -r '.data."private-ip"' <<<"${vnic_json}")"
subnet_id="$(jq -r '.data."subnet-id"' <<<"${vnic_json}")"
nsg_vcn_id="$(jq -r '.data."vcn-id"' <<<"${nsg_json}")"
[[ "${actual_private_ip}" == "${expected_private_ip}" ]] \
  || fail "VNIC private IP does not match the reviewed backend"
[[ "${subnet_id}" == ocid1.subnet.* ]] || fail "VNIC subnet ID is invalid"

subnet_json="$(oci network subnet get --subnet-id "${subnet_id}")"
subnet_vcn_id="$(jq -r '.data."vcn-id"' <<<"${subnet_json}")"
[[ "${subnet_vcn_id}" == ocid1.vcn.* ]] || fail "VNIC subnet VCN ID is invalid"
[[ "${subnet_vcn_id}" == "${nsg_vcn_id}" ]] || fail "VNIC subnet and backend NSG belong to different VCNs"

current_nsg_ids="$(jq -c '.data."nsg-ids" // []' <<<"${vnic_json}")"
vnic_etag="$(jq -r '.etag // empty' <<<"${vnic_json}")"
updated_nsg_ids="$(jq -c --arg id "${backend_nsg_id}" \
  'if index($id) then . else . + [$id] end' <<<"${current_nsg_ids}")"
[[ -n "${vnic_etag}" ]] || fail "VNIC GET response did not include an ETag"

if [[ "${current_nsg_ids}" == "${updated_nsg_ids}" ]]; then
  printf 'Backend NSG is already attached; no change was made.\n'
  exit 0
fi

[[ "${MARKETVALLEY_CONFIRM_ATTACH:-}" == "yes" ]] \
  || fail "set MARKETVALLEY_CONFIRM_ATTACH=yes after reviewing the VNIC and merged NSG list"

backup_temporary_file="${backup_file}.$$"
umask 077
printf '%s\n' "${current_nsg_ids}" >"${backup_temporary_file}"
mv -f -- "${backup_temporary_file}" "${backup_file}"

if ! update_error="$(oci network vnic update \
  --vnic-id "${vnic_id}" \
  --nsg-ids "${updated_nsg_ids}" \
  --if-match "${vnic_etag}" \
  --force 2>&1 >/dev/null)"; then
  if [[ "${update_error}" == *412* || "${update_error}" == *PreconditionFailed* ]]; then
    fail "VNIC changed concurrently (412); re-read its NSG memberships before retrying"
  fi
  fail "backend NSG update failed"
fi

verified_nsg_ids="$(oci network vnic get --vnic-id "${vnic_id}" --query 'data."nsg-ids"' --raw-output)"
jq -e --argjson expected "${updated_nsg_ids}" '. == $expected' <<<"${verified_nsg_ids}" >/dev/null \
  || fail "backend NSG attachment equality verification failed"
printf 'Backend NSG was appended without removing existing VNIC NSG memberships.\n'
