#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly terraform_binary="${TERRAFORM_1_5_7_BIN:?TERRAFORM_1_5_7_BIN is required}"
temporary_directory="$(mktemp -d /tmp/marketvalley-state-test.XXXXXX)"
cleanup() {
  [[ "${temporary_directory}" == /tmp/marketvalley-state-test.* ]] \
    && rm -rf -- "${temporary_directory}"
}
trap cleanup EXIT

input_state="${temporary_directory}/downloaded.tfstate"
output_state="${temporary_directory}/import.tfstate"
install -m 0600 "${repository_root}/tests/fixtures/marketvalley-resource-manager-state.json" "${input_state}"
"${repository_root}/infra/terraform/oci-nlb/retire-data-volume-state.sh" \
  "${input_state}" "${output_state}" >/dev/null

[[ -f "${output_state}" && -f "${output_state}.pre-retirement" ]]
cmp -s "${input_state}" "${output_state}.pre-retirement"
[[ "$("${terraform_binary}" state list -state="${output_state}")" == "oci_core_network_security_group.backend" ]]
[[ "$("${terraform_binary}" state list -state="${input_state}" | wc -l | tr -d '[:space:]')" == "3" ]]

printf 'Terraform 1.5.7 state retirement fixture passed.\n'
