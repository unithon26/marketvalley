import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const readRepositoryFile = (path) => readFileSync(join(repositoryRoot, path), "utf8");

describe("production deployment trust boundary", () => {
  it("keeps production credentials out of the shared source workflow", () => {
    const workflow = readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).not.toContain("PRODUCTION_SSH_PRIVATE_KEY");
    expect(workflow).not.toContain("PRODUCTION_SSH_HOST");
    expect(workflow).not.toMatch(/^\s{2}deploy:\s*$/mu);
    expect(workflow).toContain("(.services.app.mem_limit | tonumber) == 1610612736");
    expect(workflow).toContain("(.services.proxy.mem_limit | tonumber) == 201326592");
  });

  it("dispatches deploy and rollback through a root-owned fixed release script", () => {
    const manager = readRepositoryFile("deploy/release-manager.sh");
    const bootstrap = readRepositoryFile("deploy/bootstrap-ubuntu-rootless.sh");
    const gateway = readRepositoryFile("deploy/deploy-gateway.sh");
    const releaseScript = readRepositoryFile("deploy/remote-release.sh");
    const storageLayout = readRepositoryFile("deploy/storage-layout.sh");
    const storageStart = readRepositoryFile("deploy/verify-storage-start.sh");
    const runtimeContract = readRepositoryFile("deploy/runtime-contract").trim();

    expect(manager).toContain('/usr/local/lib/marketvalley/remote-release.sh');
    expect(manager).not.toContain('/opt/marketvalley/current/deploy/remote-release.sh');
    expect(manager).toContain('current|deploy|rollback)');
    expect(bootstrap).toContain('"${script_directory}/remote-release.sh"');
    expect(bootstrap).toContain('/usr/local/lib/marketvalley/remote-release.sh');
    expect(bootstrap).toContain('restrict,command=\\"/usr/local/lib/marketvalley/deploy-gateway.sh\\"');
    expect(gateway).toContain('SSH_ORIGINAL_COMMAND');
    expect(gateway).toContain('maximum_archive_bytes=268435456');
    expect(gateway).not.toContain("eval ");
    expect(runtimeContract).toBe("marketvalley-production-v2");
    expect(releaseScript).toContain('required_release_contract="marketvalley-production-v2"');
    expect(releaseScript).toContain('release runtime contract is incompatible with this server');
    expect(releaseScript).toContain('--driver-opt memory=2g');
    expect(releaseScript).not.toContain('--driver-opt memory=3g');
    expect(releaseScript).toContain('--oci-max-parallelism=1');
    expect(releaseScript).toContain('--oci-worker-gc-keepstorage=1024');
    expect(releaseScript).not.toContain("--max-parallelism=1");
    expect(releaseScript).toContain('deploy user aggregate CPU quota must be 125%');
    expect(releaseScript).toContain('deploy user aggregate memory limit must be 3 GiB');
    expect(releaseScript).toContain('deploy user aggregate I/O weight must be 100');
    expect(releaseScript).toContain('NEXT_PUBLIC_TURNSTILE_SITE_KEY must be a non-placeholder');
    expect(releaseScript).toContain('TURNSTILE_VERIFY_TIMEOUT_MS must be an integer between 500 and 10000');
    expect(releaseScript).toContain('RESERVATION_CAMPAIGN_MINUTE_LIMIT must not exceed');
    expect(releaseScript).toContain('production campaign lifecycle requires META_ADS_MODE=live');
    expect(releaseScript).toContain('GEUNEUL_BACKEND_UPSTREAM must use a private IPv4 address');
    expect(releaseScript).toContain('GEUNEUL_OBJECT_STORAGE_HOST must be an exact OCI S3 compatibility hostname');
    expect(readRepositoryFile("deploy/Caddyfile")).toContain("@rejected_object_storage");
    expect(readRepositoryFile("deploy/Caddyfile")).toContain("header_up Host {$GEUNEUL_OBJECT_STORAGE_HOST}");
    expect(releaseScript).not.toContain('META_DRAFT_DAILY_OWNER_LIMIT');
    expect(releaseScript).not.toContain('META_DRAFT_DAILY_GLOBAL_LIMIT');
    expect(releaseScript).toContain('validate-release-archive.py');
    expect(releaseScript).toContain('--cpus 0.75');
    expect(releaseScript).toContain('--memory 1536m');
    expect(releaseScript).toContain('--memory-swap 1536m');
    expect(releaseScript).toContain('flock --wait 2100');
    expect(releaseScript).toContain('existing release has no trusted integrity manifest');
    expect(releaseScript).toContain('.marketvalley-release-integrity');
    expect(releaseScript).toContain('same source SHA was supplied with a different archive digest');
    expect(releaseScript).toContain('A lost deploy ACK can leave the symlink updated');
    expect(bootstrap).toContain('validate-release-archive.py');
    expect(bootstrap).toContain('python3-minimal');
    expect(bootstrap).toContain('MARKETVALLEY_CONFIRM_FORMAT_DEVICE');
    expect(bootstrap).toContain('/dev/oracleoci/oraclevdb');
    expect(bootstrap).toContain('mkfs.ext4 -F -L marketvalley');
    expect(bootstrap).toContain('"${filesystem_label}" == "marketvalley"');
    expect(bootstrap).toContain('/opt/marketvalley/docker');
    expect(releaseScript).toContain('marketvalley_verify_storage_layout');
    expect(storageLayout).toContain('boot-bind-v1');
    expect(storageLayout).toContain('/var/lib/marketvalley');
    expect(storageLayout).toContain('MARKETVALLEY_BOOT_MINIMUM_FREE_KIB=$((40 * 1024 * 1024))');
    expect(storageLayout).toContain('MARKETVALLEY_MAXIMUM_INODE_USE_PERCENT=90');
    expect(storageLayout).toContain('FSROOT');
    expect(bootstrap).toContain('ExecStartPre=/usr/local/lib/marketvalley/verify-storage-start.sh');
    expect(storageStart).toContain('marketvalley_verify_storage_layout');
    expect(storageStart).not.toContain('marketvalley_require_storage_capacity');
    expect(releaseScript).toContain('marketvalley_require_storage_capacity');
    expect(releaseScript).toContain('compose up --detach --no-build app lifecycle-worker proxy');
    expect(releaseScript).toContain('compose up --detach --no-build --force-recreate lifecycle-worker');
    expect(releaseScript).toContain('"${image}" == "marketvalley:${expected_sha}"');
    expect(releaseScript).toContain('wait_for_running_lifecycle_worker "${target_sha}" || return 1');
  });

  it("retires the paid block volume through an exact Terraform 1.5 state handoff", () => {
    const terraform = readRepositoryFile("infra/terraform/oci-nlb/main.tf");
    const versions = readRepositoryFile("infra/terraform/oci-nlb/versions.tf");
    const retirement = readRepositoryFile("infra/terraform/oci-nlb/retire-data-volume-state.sh");

    expect(terraform).not.toContain('resource "oci_core_volume" "marketvalley_data"');
    expect(terraform).not.toContain('resource "oci_core_volume_attachment" "marketvalley_data"');
    expect(terraform).not.toContain("removed {");
    expect(versions).toContain('required_version = ">= 1.5.7, < 1.6.0"');
    expect(retirement).toContain('readonly volume_address="oci_core_volume.marketvalley_data"');
    expect(retirement).toContain('readonly attachment_address="oci_core_volume_attachment.marketvalley_data"');
    expect(retirement).toContain('terraform_version}" == "1.5.7"');
    expect(retirement).toContain('state rm -dry-run');
    expect(retirement).toContain('cmp -s "${input_state}" "${backup_state}"');
  });

  it("uses the current OCI CLI NSG identifier without replacing VNIC memberships", () => {
    for (const path of [
      "infra/terraform/oci-nlb/attach-backend-nsg.sh",
      "infra/terraform/oci-nlb/detach-backend-nsg.sh",
    ]) {
      const script = readRepositoryFile(path);
      expect(script).toContain('network nsg get --nsg-id "${backend_nsg_id}"');
      expect(script).not.toContain("--network-security-group-id");
      expect(script).toContain('oci network vnic get --vnic-id "${vnic_id}"');
      expect(script).toContain("--if-match");
    }
  });
});
