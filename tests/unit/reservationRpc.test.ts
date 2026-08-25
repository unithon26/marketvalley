import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  CampaignNotFoundError,
  DuplicateSignalError,
  ReservationRateLimitError,
  ReservationStoreUnavailableError,
} from "@/lib/contracts/repository";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";

function repositoryWithResult(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return {
    repository: new SupabaseCampaignRepository({
      serviceClient: { rpc } as never,
      hashSecret: "0123456789abcdef0123456789abcdef", // gitleaks:allow -- deterministic test fixture
      reservationLimits: { campaignMinute: 10, globalMinute: 120, campaignTotal: 1_000 },
      now: () => new Date("2026-08-25T00:00:00.000Z"),
    }),
    rpc,
  };
}

const input = {
  campaignId: "11111111-1111-1111-1111-111111111111",
  name: " 예약자 ",
  email: "Person@Example.com",
  consent: true as const,
};

describe("reservation RPC adapter", () => {
  it("개인정보와 quota를 한 RPC 호출로 전달하고 inserted를 성공 처리한다", async () => {
    const { repository, rpc } = repositoryWithResult("inserted");
    await expect(repository.recordReservation(input)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("record_campaign_reservation", expect.objectContaining({
      p_name: "예약자",
      p_email: "person@example.com",
      p_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      p_campaign_minute_limit: 10,
      p_global_minute_limit: 120,
      p_campaign_total_limit: 1_000,
    }));
  });

  it.each([
    ["duplicate", DuplicateSignalError],
    ["not_found", CampaignNotFoundError],
    ["rate_limited", ReservationRateLimitError],
    ["capacity", ReservationRateLimitError],
  ])("RPC 결과 %s를 공개 계약 오류로 해석한다", async (result, ErrorType) => {
    const { repository } = repositoryWithResult(result);
    await expect(repository.recordReservation(input)).rejects.toBeInstanceOf(ErrorType);
  });

  it("DB 오류와 알 수 없는 결과를 503용 오류로 닫는다", async () => {
    await expect(repositoryWithResult(null, { code: "57014" }).repository.recordReservation(input))
      .rejects.toBeInstanceOf(ReservationStoreUnavailableError);
    await expect(repositoryWithResult("unexpected").repository.recordReservation(input))
      .rejects.toBeInstanceOf(ReservationStoreUnavailableError);
  });
});

describe("reservation abuse migration contract", () => {
  const migrationPath = fileURLToPath(new URL(
    "../../supabase/migrations/202608250002_reservation_abuse_protection.sql",
    import.meta.url,
  ));
  const sql = readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n");

  it("SECURITY INVOKER와 빈 search_path, service_role 전용 실행 권한을 고정한다", () => {
    expect(sql).toContain("create or replace function public.record_campaign_reservation");
    expect(sql).toContain("security invoker\nset search_path = ''");
    expect(sql).toMatch(/revoke execute on function public\.record_campaign_reservation\([\s\S]+from public, anon, authenticated;/u);
    expect(sql).toMatch(/grant execute on function public\.record_campaign_reservation\([\s\S]+to service_role;/u);
    expect(sql).not.toContain("security definer");
  });

  it("global→campaign 잠금 뒤 quota·duplicate·capacity·insert를 한 함수에서 처리한다", () => {
    const globalLock = sql.indexOf("from public.reservation_global_minute_usage");
    const campaignLock = sql.indexOf("perform 1 from public.campaigns");
    const insert = sql.indexOf("insert into public.campaign_reservations");
    expect(globalLock).toBeGreaterThan(0);
    expect(campaignLock).toBeGreaterThan(globalLock);
    expect(insert).toBeGreaterThan(campaignLock);
    expect(sql).toContain("for update");
    expect(sql).toContain("return 'rate_limited'");
    expect(sql).toContain("return 'capacity'");
    expect(sql).toContain("on conflict (campaign_id, email_hash) do nothing");
    expect(sql).toContain("p_campaign_minute_limit is null");
    expect(sql).toContain("p_global_minute_limit is null");
    expect(sql).toContain("p_campaign_total_limit is null");
  });
});
