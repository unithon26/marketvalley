import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(repositoryRoot, "infra/terraform/oci-nlb/attach-backend-nsg.sh");
const detachScriptPath = join(repositoryRoot, "infra/terraform/oci-nlb/detach-backend-nsg.sh");
const bashExecutable = process.env.BASH_PATH
  ?? (process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash");
const temporaryDirectories = [];

function createMockOci() {
  const directory = mkdtempSync(join(tmpdir(), "marketvalley-oci-nsg-"));
  temporaryDirectories.push(directory);
  const logPath = join(directory, "oci.log");
  const ociPath = join(directory, "oci");
  const mock = `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\n' "$*" >>"$MARKETVALLEY_TEST_OCI_LOG"
if [[ "$1 $2 $3" == "network vnic get" ]]; then
  if [[ " $* " == *" --query "* ]]; then
    if [[ "\${MARKETVALLEY_TEST_MODE:-attach}" == "detach" ]]; then
      printf '%s\\n' '["ocid1.networksecuritygroup.test.existing"]'
    else
      printf '%s\\n' '["ocid1.networksecuritygroup.test.existing","ocid1.networksecuritygroup.test.backend"]'
    fi
  else
    if [[ "\${MARKETVALLEY_TEST_MODE:-attach}" == "detach" ]]; then
      printf '%s\\n' '{"etag":"detach-etag","data":{"private-ip":"10.0.0.9","subnet-id":"ocid1.subnet.test.backend","nsg-ids":["ocid1.networksecuritygroup.test.existing","ocid1.networksecuritygroup.test.backend"]}}'
    else
      printf '%s\\n' '{"etag":"attach-etag","data":{"private-ip":"10.0.0.9","subnet-id":"ocid1.subnet.test.backend","nsg-ids":["ocid1.networksecuritygroup.test.existing"]}}'
    fi
  fi
elif [[ "$1 $2 $3" == "network subnet get" ]]; then
  printf '%s\\n' '{"data":{"vcn-id":"ocid1.vcn.test.reviewed"}}'
elif [[ "$1 $2 $3" == "network nsg get" ]]; then
  printf '%s\\n' '{"data":{"vcn-id":"ocid1.vcn.test.reviewed"}}'
elif [[ "$1 $2 $3" == "network vnic update" ]]; then
  exit 0
else
  printf 'unexpected OCI invocation: %s\\n' "$*" >&2
  exit 1
fi
`;
  writeFileSync(ociPath, mock, { mode: 0o700 });
  chmodSync(ociPath, 0o700);
  return { directory, logPath };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === "win32")("OCI backend NSG attachment", () => {
  it("VNIC subnet의 VCN을 검증하고 기존 NSG를 보존한 채 backend NSG를 append한다", () => {
    const { directory, logPath } = createMockOci();
    const backupPath = join(directory, "pre-attach-nsgs.json");

    const output = execFileSync(bashExecutable, [scriptPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        MARKETVALLEY_TEST_OCI_LOG: logPath,
        MARKETVALLEY_CONFIRM_ATTACH: "yes",
        MARKETVALLEY_NSG_BACKUP_FILE: backupPath,
        MARKETVALLEY_VNIC_ID: "ocid1.vnic.test.backend",
        MARKETVALLEY_BACKEND_NSG_ID: "ocid1.networksecuritygroup.test.backend",
      },
    });

    expect(output).toContain("Backend NSG was appended");
    const invocations = readFileSync(logPath, "utf8");
    expect(invocations).toContain("network subnet get --subnet-id ocid1.subnet.test.backend");
    expect(invocations).toContain("network vnic update --vnic-id ocid1.vnic.test.backend");
    expect(invocations).toContain("--if-match attach-etag");
    expect(invocations).toContain("--nsg-ids [\"ocid1.networksecuritygroup.test.existing\",\"ocid1.networksecuritygroup.test.backend\"]");
    expect(readFileSync(backupPath, "utf8").trim()).toBe("[\"ocid1.networksecuritygroup.test.existing\"]");
  });

  it("reviewed backup과 완전히 일치할 때만 backend NSG 하나를 제거한다", () => {
    const { directory, logPath } = createMockOci();
    const backupPath = join(directory, "pre-attach-nsgs.json");
    writeFileSync(backupPath, '["ocid1.networksecuritygroup.test.existing"]\n', { mode: 0o600 });

    const output = execFileSync(bashExecutable, [detachScriptPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        MARKETVALLEY_TEST_OCI_LOG: logPath,
        MARKETVALLEY_TEST_MODE: "detach",
        MARKETVALLEY_CONFIRM_DETACH: "yes",
        MARKETVALLEY_NSG_BACKUP_FILE: backupPath,
        MARKETVALLEY_VNIC_ID: "ocid1.vnic.test.backend",
        MARKETVALLEY_BACKEND_NSG_ID: "ocid1.networksecuritygroup.test.backend",
      },
    });

    expect(output).toContain("Backend NSG was removed");
    const invocations = readFileSync(logPath, "utf8");
    expect(invocations).toContain("--if-match detach-etag");
    expect(invocations).toContain("--nsg-ids [\"ocid1.networksecuritygroup.test.existing\"]");
  });
});
