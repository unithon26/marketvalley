import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/202608260006_campaign_lifecycle.sql",
  import.meta.url,
)), "utf8");
const ownerDeleteMigration = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/202608260008_owner_campaign_delete.sql",
  import.meta.url,
)), "utf8");
const concurrentRunsMigration = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/202608260009_allow_concurrent_meta_runs.sql",
  import.meta.url,
)), "utf8");

describe("campaign lifecycle migration", () => {
  it("이전 캠페인을 먼저 보관하고 실제 Meta run만 현재 lifecycle로 복원한다", () => {
    const archive = migration.indexOf("lifecycle_status = 'ARCHIVED'");
    const backfill = migration.indexOf("with latest_runs as");
    expect(archive).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(archive);
    expect(migration).toContain("multiple_live_meta_runs_per_account");
    expect(migration).toContain("meta_ad_runs_one_live_per_account_idx");
  });

  it("브라우저에서 lifecycle 조작과 live 캠페인 삭제를 허용하지 않는다", () => {
    expect(migration).toContain("revoke insert, update, delete on table public.campaigns from authenticated");
    expect(migration).toContain("grant insert (draft_id, input_background, input_solution)");
    expect(migration).toContain("grant update (next_action)");
    expect(migration).toContain("campaign_has_meta_run");
  });

  it("worker claim과 상태 전이를 service role·lease token으로 제한한다", () => {
    expect(migration).toContain("campaign_lifecycle_service_role_required");
    expect(migration).toContain("processing_lease_until > clock_timestamp()");
    expect(migration).toContain("campaigns.processing_token = p_processing_token");
  });

  it("캠페인별 고정 예산을 유지하면서 광고계정 전체 직렬화는 제거한다", () => {
    expect(concurrentRunsMigration).toContain(
      "drop index if exists public.meta_ad_runs_one_live_per_account_idx",
    );
  });

  it("소유자 삭제는 row lock 뒤 처리 lease와 Meta 외부 상태를 확인한다", () => {
    expect(ownerDeleteMigration).toContain("owner_id = auth.uid()");
    expect(ownerDeleteMigration).toContain("for update");
    expect(ownerDeleteMigration).toContain("processing_lease_until > clock_timestamp()");
    expect(ownerDeleteMigration).toContain("status <> 'PAUSED'");
    expect(ownerDeleteMigration).toContain("from public.meta_ad_operations");
    expect(ownerDeleteMigration).toContain("return 'external_state_unknown'");
    expect(ownerDeleteMigration).toContain("to authenticated");
  });
});
