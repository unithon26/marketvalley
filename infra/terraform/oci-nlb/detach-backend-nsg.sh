#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  printf 'marketvalley NSG detach error: %s\n' "$1" >&2
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
[[ "${backend_nsg_id}" == ocid1.networksecuritygroup.* ]] || fail "MARKETVALLEY_BACKEND_NSG_ID is invalid"
[[ "${backup_file}" == /* && -f "${backup_file}" && ! -L "${backup_file}" ]] \
  || fail "MARKETVALLEY_NSG_BACKUP_FILE must be a regular absolute backup file"

backup_nsg_ids="$(jq -c . "${backup_file}")"
jq -e 'type == "array" and all(.[]; type == "string")' <<<"${backup_nsg_ids}" >/dev/null \
  || fail "NSG backup is invalid"

vnic_json="$(oci network vnic get --vnic-id "${vnic_id}")"
nsg_json="$(oci network nsg get --nsg-id "${backend_nsg_id}")"
actual_private_ip="$(jq -r '.data."private-ip"' <<<"${vnic_json}")"
subnet_id="$(jq -r '.data."subnet-id"' <<<"${vnic_json}")"
vnic_etag="$(jq -r '.etag // empty' <<<"${vnic_json}")"
[[ "${actual_private_ip}" == "${expected_private_ip}" ]] || fail "VNIC private IP does not match the reviewed backend"
[[ "${subnet_id}" == ocid1.subnet.* && -n "${vnic_etag}" ]] || fail "VNIC identity or ETag is invalid"

subnet_json="$(oci network subnet get --subnet-id "${subnet_id}")"
[[ "$(jq -r '.data."vcn-id"' <<<"${subnet_json}")" == "$(jq -r '.data."vcn-id"' <<<"${nsg_json}")" ]] \
  || fail "VNIC subnet and backend NSG belong to different VCNs"

current_nsg_ids="$(jq -c '.data."nsg-ids" // []' <<<"${vnic_json}")"
updated_nsg_ids="$(jq -c --arg id "${backend_nsg_id}" 'map(select(. != $id))' <<<"${current_nsg_ids}")"
jq -e --arg id "${backend_nsg_id}" 'index($id) != null' <<<"${current_nsg_ids}" >/dev/null \
  || fail "backend NSG is not attached"
[[ "${updated_nsg_ids}" == "${backup_nsg_ids}" ]] \
  || fail "VNIC NSG memberships differ from the reviewed backup; refusing to remove other changes"
[[ "${MARKETVALLEY_CONFIRM_DETACH:-}" == "yes" ]] \
  || fail "set MARKETVALLEY_CONFIRM_DETACH=yes after reviewing the exact backup equality"

if ! update_error="$(oci network vnic update \
  --vnic-id "${vnic_id}" \
  --nsg-ids "${updated_nsg_ids}" \
  --if-match "${vnic_etag}" \
  --force 2>&1 >/dev/null)"; then
  if [[ "${update_error}" == *412* || "${update_error}" == *PreconditionFailed* ]]; then
    fail "VNIC changed concurrently (412); re-read its NSG memberships before retrying"
  fi
  fail "backend NSG detach failed"
fi

verified_nsg_ids="$(oci network vnic get --vnic-id "${vnic_id}" --query 'data."nsg-ids"' --raw-output)"
jq -e --argjson expected "${backup_nsg_ids}" '. == $expected' <<<"${verified_nsg_ids}" >/dev/null \
  || fail "backend NSG detach equality verification failed"
printf 'Backend NSG was removed and every reviewed pre-existing VNIC NSG membership was restored.\n'
