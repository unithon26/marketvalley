import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CampaignNotFoundError,
  DraftOwnershipError,
  DuplicateSignalError,
} from "@/lib/contracts/repository";
import { demoCampaign } from "@/lib/demo/demo-campaign";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";

type CampaignRow = {
  id: string;
  owner_id: string;
  draft_id: string;
  slug: string;
  spec: unknown;
  next_action: string | null;
  published_at: string;
};

type ReservationRow = {
  id: string;
  campaign_id: string;
  name: string;
  email: string;
  email_hash: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  reserved_at: string;
};

type FakeState = {
  campaigns: CampaignRow[];
  reservations: ReservationRow[];
  sequence: number;
};

type TableName = "campaigns" | "campaign_reservations";
type Role = { kind: "service" } | { kind: "owner"; userId: string };

class FakeQuery implements PromiseLike<{ data: unknown; error: null | { code: string; message: string } }> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private values: Record<string, unknown> = {};
  private readonly filters: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly state: FakeState,
    private readonly role: Role,
    private readonly table: TableName,
  ) {}

  select(): this {
    return this;
  }

  insert(values: Record<string, unknown>): this {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.operation = "update";
    this.values = values;
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  order(): this {
    return this;
  }

  async single() {
    const result = await this.execute();
    if (Array.isArray(result.data)) {
      return { ...result, data: result.data[0] ?? null };
    }
    return result;
  }

  async maybeSingle() {
    return this.single();
  }

  then<TResult1 = { data: unknown; error: null | { code: string; message: string } }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null | { code: string; message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private rows(): Array<CampaignRow | ReservationRow> {
    const rows = this.table === "campaigns" ? this.state.campaigns : this.state.reservations;
    const ownerUserId = this.role.kind === "owner" ? this.role.userId : null;
    const accessible = ownerUserId === null
      ? rows
      : rows.filter((row) => {
        if (this.table === "campaigns") return (row as CampaignRow).owner_id === ownerUserId;
        const campaign = this.state.campaigns.find(
          (item) => item.id === (row as ReservationRow).campaign_id,
        );
        return campaign?.owner_id === ownerUserId;
      });
    return accessible.filter((row) => this.filters.every(
      ({ column, value }) => (row as unknown as Record<string, unknown>)[column] === value,
    ));
  }

  private async execute(): Promise<{ data: unknown; error: null | { code: string; message: string } }> {
    if (this.operation === "select") return { data: structuredClone(this.rows()), error: null };

    if (this.operation === "insert") {
      if (this.table === "campaigns") {
        if (this.role.kind !== "owner") return { data: null, error: { code: "42501", message: "RLS" } };
        const ownerUserId = this.role.userId;
        const duplicate = this.state.campaigns.some((row) => (
          (row.owner_id === ownerUserId && row.draft_id === this.values.draft_id)
          || row.slug === this.values.slug
        ));
        if (duplicate) return { data: null, error: { code: "23505", message: "duplicate" } };
        const row = {
          id: `campaign-${++this.state.sequence}`,
          owner_id: ownerUserId,
          ...this.values,
        } as CampaignRow;
        this.state.campaigns.push(row);
        return { data: structuredClone(row), error: null };
      }

      const duplicate = this.state.reservations.some((row) => (
        row.campaign_id === this.values.campaign_id && row.email_hash === this.values.email_hash
      ));
      if (duplicate) return { data: null, error: { code: "23505", message: "duplicate" } };
      const row = {
        id: `reservation-${++this.state.sequence}`,
        ...this.values,
      } as ReservationRow;
      this.state.reservations.push(row);
      return { data: structuredClone(row), error: null };
    }

    const matched = this.rows();
    if (this.operation === "update") {
      for (const row of matched) Object.assign(row, this.values);
      return { data: structuredClone(matched), error: null };
    }

    if (this.table === "campaigns") {
      const ids = new Set(matched.map((row) => (row as CampaignRow).id));
      this.state.campaigns = this.state.campaigns.filter((row) => !ids.has(row.id));
      this.state.reservations = this.state.reservations.filter((row) => !ids.has(row.campaign_id));
    } else {
      const ids = new Set(matched.map((row) => (row as ReservationRow).id));
      this.state.reservations = this.state.reservations.filter((row) => !ids.has(row.id));
    }
    return { data: null, error: null };
  }
}

function fakeClient(state: FakeState, role: Role) {
  return {
    from(table: TableName) {
      return new FakeQuery(state, role, table);
    },
    async rpc(name: string, input: { p_campaign_id: string; p_draft_id: string }) {
      if (name !== "reset_owned_campaign" || role.kind !== "owner") {
        return { data: null, error: { code: "42501", message: "forbidden" } };
      }
      const campaign = state.campaigns.find((row) => (
        row.id === input.p_campaign_id
        && row.draft_id === input.p_draft_id
        && row.owner_id === role.userId
      ));
      if (!campaign) return { data: [], error: null };
      state.reservations = state.reservations.filter(
        (row) => row.campaign_id !== campaign.id,
      );
      campaign.next_action = null;
      return { data: [structuredClone(campaign)], error: null };
    },
  };
}

function repository(
  state: FakeState,
  userId: string,
  serviceClient: ReturnType<typeof fakeClient>,
) {
  return new SupabaseCampaignRepository({
    ownerClient: fakeClient(state, { kind: "owner", userId }) as never,
    serviceClient: serviceClient as never,
    hashSecret: "0123456789abcdef0123456789abcdef",
    now: () => new Date("2026-08-25T00:00:00.000Z"),
    slugSuffix: () => "deadbeef",
  });
}

describe("SupabaseCampaignRepository", () => {
  it("게시·공개 조회·예약·판단·live reset을 같은 계약으로 수행한다", async () => {
    const state: FakeState = { campaigns: [], reservations: [], sequence: 0 };
    const serviceClient = fakeClient(state, { kind: "service" });
    const owner = repository(state, "user-a", serviceClient);

    const campaign = await owner.publish("draft-1", demoCampaign);
    await expect(owner.publish("draft-1", demoCampaign)).resolves.toEqual(campaign);
    await expect(owner.getBySlug(campaign.slug)).resolves.toMatchObject({ id: campaign.id });

    await owner.recordReservation({
      campaignId: campaign.id,
      name: "홍길동",
      email: " Person@Example.com ",
      consent: true,
      utm: { source: "demo" },
    });
    await expect(owner.getReservationSummary(campaign.id)).resolves.toMatchObject({
      total: 1,
      recent: [{ name: "홍길동", email: "person@example.com", utm: { source: "demo" } }],
    });
    await expect(owner.recordReservation({
      campaignId: campaign.id,
      name: "다른 이름",
      email: "person@example.com",
      consent: true,
    })).rejects.toBeInstanceOf(DuplicateSignalError);

    await expect(owner.saveNextAction({
      campaignId: campaign.id,
      draftId: "wrong",
      nextAction: "continue",
    })).rejects.toBeInstanceOf(DraftOwnershipError);
    await owner.saveNextAction({ campaignId: campaign.id, draftId: "draft-1", nextAction: "revise" });
    const reset = await owner.reset({ campaignId: campaign.id, draftId: "draft-1" });
    expect(reset.nextAction).toBeNull();
    await expect(owner.getReservationSummary(campaign.id)).resolves.toMatchObject({ total: 0 });
  });

  it("다른 사용자의 owner client에서는 캠페인과 예약자 원문을 숨긴다", async () => {
    const state: FakeState = { campaigns: [], reservations: [], sequence: 0 };
    const serviceClient = fakeClient(state, { kind: "service" });
    const ownerA = repository(state, "user-a", serviceClient);
    const ownerB = repository(state, "user-b", serviceClient);
    const campaign = await ownerA.publish("draft-a", demoCampaign);
    await ownerA.recordReservation({
      campaignId: campaign.id,
      name: "예약자",
      email: "private@example.com",
      consent: true,
    });

    await expect(ownerB.getById(campaign.id)).resolves.toBeNull();
    await expect(ownerB.getReservationSummary(campaign.id))
      .rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(ownerB.getBySlug(campaign.slug)).resolves.toMatchObject({ id: campaign.id });
  });
});

describe("Supabase migration security contract", () => {
  it("owner RLS, 비공개 예약 원문과 service-only quota RPC를 고정한다", () => {
    const migrationPath = fileURLToPath(new URL(
      "../../supabase/migrations/202608250001_campaigns_reservations_and_generation_limits.sql",
      import.meta.url,
    ));
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("alter table public.campaigns enable row level security");
    expect(sql).toContain("alter table public.campaign_reservations enable row level security");
    expect(sql).toContain("create policy campaigns_owner_insert");
    expect(sql).toContain("(select auth.uid()) = owner_id");
    expect(sql).toContain("revoke all on table public.campaign_reservations from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+select[^;]+campaign_reservations\s+to\s+anon/i);
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("security invoker\nset search_path = ''");
    expect(sql).toContain("reset_owned_campaign");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});
