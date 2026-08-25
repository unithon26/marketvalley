import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MetaOperationBusyError,
  MetaOperationConflictError,
  MetaOperationLedgerUnavailableError,
  MetaOperationQuotaExceededError,
  MetaReconciliationResolutionError,
} from "@/lib/meta/operationLedger";
import {
  type MetaOperationRpcClient,
  SupabaseMetaOperationLedger,
} from "@/lib/meta/supabaseMetaOperationLedger";

const ownerId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const leaseToken = "33333333-3333-4333-8333-333333333333";
const descriptor = {
  operationKey: `meta-paused-v1:${"a".repeat(64)}`,
  fingerprint: "b".repeat(64),
};

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation_key: descriptor.operationKey,
    fingerprint: descriptor.fingerprint,
    owner_id: ownerId,
    campaign_id: campaignId,
    status: "OPEN",
    checkpoints: {},
    attempting_step: null,
    reconciliation_step: null,
    reconciliation_history: [],
    result: null,
    ...overrides,
  };
}

function ledger(client: MetaOperationRpcClient): SupabaseMetaOperationLedger {
  return new SupabaseMetaOperationLedger({
    client,
    ownerId,
    campaignId,
    createLeaseToken: () => leaseToken,
  });
}

describe("SupabaseMetaOperationLedger RPC adapter", () => {
  it("sends acquire, attempt, checkpoint, and release transitions to a scripted RPC client", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: row(), error: null })
      .mockResolvedValueOnce({ data: row({ attempting_step: "campaign" }), error: null })
      .mockResolvedValueOnce({ data: row({ checkpoints: { campaign: "campaign_12345" } }), error: null })
      .mockResolvedValueOnce({ data: row({ checkpoints: { campaign: "campaign_12345" } }), error: null });
    const client = { rpc } as unknown as MetaOperationRpcClient;

    const value = await ledger(client).withExclusiveOperation(descriptor, async (session) => {
      await session.beginAttempt("campaign");
      expect(session.read().attemptingStep).toBe("campaign");
      await session.checkpoint("campaign", "campaign_12345");
      expect(session.read()).toMatchObject({ checkpoints: { campaign: "campaign_12345" } });
      return "done";
    });

    expect(value).toBe("done");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "acquire_meta_ad_operation",
      "transition_meta_ad_operation",
      "transition_meta_ad_operation",
      "transition_meta_ad_operation",
    ]);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_owner_id: ownerId,
      p_campaign_id: campaignId,
      p_lease_token: leaseToken,
      p_lease_seconds: 300,
      p_daily_owner_limit: 3,
      p_daily_global_limit: 100,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_action: "begin", p_step: "campaign" });
    expect(rpc.mock.calls[2][1]).toMatchObject({
      p_action: "checkpoint",
      p_step: "campaign",
      p_external_id: "campaign_12345",
    });
    expect(rpc.mock.calls[3][1]).toMatchObject({ p_action: "release" });
  });

  it.each([
    ["meta_operation_conflict", MetaOperationConflictError],
    ["meta_operation_busy", MetaOperationBusyError],
    ["meta_operation_lease_lost", MetaOperationBusyError],
    ["meta_operation_quota_exceeded", MetaOperationQuotaExceededError],
    ["upstream leaked internal detail", MetaOperationLedgerUnavailableError],
  ])("maps safe database marker %s without leaking raw errors", async (message, ErrorType) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }),
    } as unknown as MetaOperationRpcClient;

    const error = await ledger(client)
      .withExclusiveOperation(descriptor, async () => undefined)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ErrorType);
    expect(String(error)).not.toContain(message === "upstream leaked internal detail" ? message : "never");
  });

  it("validates operator resolution before the RPC and accepts only an explicit audited result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: row({
        checkpoints: { campaign: "campaign_12345" },
        reconciliation_history: [{
          step: "campaign",
          outcome: "VERIFIED_CREATED",
          externalId: "campaign_12345",
          resolvedBy: "operator_12345",
          note: "Ads Manager에서 campaign ID와 생성 시각을 확인했습니다.",
          resolvedAt: "2026-08-25T12:00:00.000Z",
        }],
      }),
      error: null,
    });
    const durableLedger = ledger({ rpc } as unknown as MetaOperationRpcClient);

    await expect(durableLedger.resolveReconciliation(descriptor, {
      step: "campaign",
      outcome: "VERIFIED_CREATED",
      resolvedBy: "operator_12345",
      note: "외부 ID가 없는 잘못된 확인입니다.",
    })).rejects.toBeInstanceOf(MetaReconciliationResolutionError);
    expect(rpc).not.toHaveBeenCalled();

    const record = await durableLedger.resolveReconciliation(descriptor, {
      step: "campaign",
      outcome: "VERIFIED_CREATED",
      externalId: "campaign_12345",
      resolvedBy: "operator_12345",
      note: "Ads Manager에서 campaign ID와 생성 시각을 확인했습니다.",
    });

    expect(record).toMatchObject({
      status: "OPEN",
      checkpoints: { campaign: "campaign_12345" },
      reconciliationHistory: [{ outcome: "VERIFIED_CREATED", resolvedBy: "operator_12345" }],
    });
    expect(rpc).toHaveBeenCalledWith("resolve_meta_ad_operation_reconciliation", expect.objectContaining({
      p_external_id: "campaign_12345",
      p_resolved_by: "operator_12345",
    }));
  });

  it("does not replace the operation failure when best-effort lease release also fails", async () => {
    const original = new Error("original operation failure");
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: row(), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "release unavailable" } });

    await expect(ledger({ rpc } as unknown as MetaOperationRpcClient)
      .withExclusiveOperation(descriptor, async () => { throw original; }))
      .rejects.toBe(original);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed scripted RPC records", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: row({ status: "COMPLETED", result: { status: "PAUSED" } }),
        error: null,
      }),
    } as unknown as MetaOperationRpcClient;

    await expect(ledger(client).withExclusiveOperation(descriptor, async () => undefined))
      .rejects.toBeInstanceOf(MetaOperationLedgerUnavailableError);
  });
});

describe("Meta operation migration static contract (not PostgreSQL execution proof)", () => {
  it("guards required RPC arguments and exposes only SECURITY DEFINER RPC execution to service_role", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sql = await readFile(
      `${root}supabase/migrations/202608250003_meta_paused_draft_operations.sql`,
      "utf8",
    );
    const acquire = sql.slice(
      sql.indexOf("create or replace function public.acquire_meta_ad_operation"),
      sql.indexOf("create or replace function public.transition_meta_ad_operation"),
    );
    const transition = sql.slice(
      sql.indexOf("create or replace function public.transition_meta_ad_operation"),
      sql.indexOf("create or replace function public.resolve_meta_ad_operation_reconciliation"),
    );
    const resolve = sql.slice(
      sql.indexOf("create or replace function public.resolve_meta_ad_operation_reconciliation"),
      sql.indexOf("revoke execute on function"),
    );
    for (const guard of [
      "p_operation_key is null", "p_fingerprint is null", "p_owner_id is null",
      "p_campaign_id is null", "p_lease_token is null", "p_lease_seconds is null",
      "p_daily_owner_limit is null", "p_daily_global_limit is null",
    ]) expect(acquire).toContain(guard);
    for (const guard of [
      "p_operation_key is null", "p_fingerprint is null", "p_lease_token is null",
      "p_lease_seconds is null", "p_action is null", "p_step is null",
      "p_external_id is null", "p_result is null",
    ]) expect(transition).toContain(guard);
    for (const guard of [
      "p_operation_key is null", "p_fingerprint is null", "p_owner_id is null",
      "p_campaign_id is null", "p_step is null", "p_outcome is null",
      "p_external_id is null", "p_resolved_by is null", "p_note is null",
    ]) expect(resolve).toContain(guard);
    expect(transition).toContain("v_operation.lease_token is distinct from p_lease_token");
    expect(transition).toContain("v_operation.lease_expires_at is null");
    expect(sql).toContain("static tests check the SQL contract");
    expect(sql.match(/to service_role;/gu)).toHaveLength(3);
    expect(sql).not.toMatch(/grant execute[\s\S]*?to (?:anon|authenticated)/u);
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*?on table[\s\S]*?to service_role/iu);
    expect(sql.match(/revoke all on table[\s\S]*?service_role;/gu)).toHaveLength(3);
    expect(sql.match(/revoke execute on function[\s\S]*?service_role;/gu)).toHaveLength(3);
  });

  it("allows completion only when all nine checkpoints match the PAUSED result", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sql = await readFile(
      `${root}supabase/migrations/202608250003_meta_paused_draft_operations.sql`,
      "utf8",
    );

    expect(sql).toContain("?& array['image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad']");
    expect(sql).toContain("p_result ->> 'status' is distinct from 'PAUSED'");
    expect(sql).toContain("jsonb_typeof(p_result -> 'campaignId') is distinct from 'string'");
    for (const [resultKey, checkpoint] of [
      ["campaignId", "campaign"],
      ["adSetId", "ad-set"],
      ["creativeId", "creative"],
      ["adId", "ad"],
    ]) {
      expect(sql).toContain(`p_result ->> '${resultKey}' is distinct from v_operation.checkpoints ->> '${checkpoint}'`);
    }
    for (let index = 0; index < 5; index += 1) {
      expect(sql).toContain(`jsonb_typeof(p_result -> 'imageHashes' -> ${index}) is distinct from 'string'`);
      expect(sql).toContain(`p_result -> 'imageHashes' ->> ${index} is distinct from v_operation.checkpoints ->> 'image:${index}'`);
    }
  });
});
