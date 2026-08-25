# B-1: Supabase CampaignRepository 어댑터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Codex 세션을 위한 안내:** 이 플랜은 Claude Code 세션이 아니라 별도 세션(Codex)이 실행한다. 위 서브스킬 지시는 Claude Code 전용이며, Codex는 아래 태스크를 순서대로 실행하면 된다.

**Goal:** `lib/demo/fixtureRepository.ts`(server 메모리)를 대체할 `CampaignRepository`의 실제 Supabase 구현체를 만들고, `CAMPAIGN_REPOSITORY_MODE` 환경변수로 fixture/live를 명시적으로 전환한다.

**Architecture:** 이미 검증된 Supabase 프로젝트(Google OAuth용으로 B가 구축·검증 완료, `docs/authentication.md` 참고)에 `campaigns`·`campaign_reservations` 테이블을 새로 추가한다. 인증에 쓰는 `lib/supabase/server.ts`(쿠키 기반 SSR client, 사용자 세션용)와는 별개로, 이 repository는 **서버 전용 service-role client**를 새로 만든다 — 특정 사용자 세션과 무관하게 서버가 모든 캠페인 데이터에 접근해야 하기 때문이다. `lib/ai/`가 이미 쓰고 있는 `CAMPAIGN_GENERATOR_MODE=fixture|openai` 모드 게이팅 패턴(`lib/ai/generatorConfig.ts`, `lib/ai/campaignGenerator.ts`, ADR-0014)을 그대로 따라 한다 — 기본값은 항상 `fixture`, 명시적으로 켜기 전까지 Supabase에 쓰기를 하지 않는다.

**Tech Stack:** `@supabase/supabase-js`(이미 의존성에 있음, service-role 접근에는 `@supabase/ssr`의 쿠키 기반 client가 필요 없다), PostgreSQL(Supabase), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-reservation-list-migration-design.md` §1(데이터 계약), `docs/decisions/0013-switch-anonymous-signal-to-named-reservation.md`, `docs/decisions/0014-keep-development-generation-free-and-gate-openai.md`(이번에 따라 할 모드 게이팅 선례)

## Global Constraints

- **진짜 소스 오브 트루스는 `lib/contracts/repository.ts`의 TypeScript 타입이다.** `docs/spec.md`의 "데이터베이스" 섹션은 이 플랜의 Task 1에서 고치기 전까지 `signals`/`signal_type`이라는 옛 이름으로 드리프트돼 있다 — 그 이름을 따라가지 않는다.
- `ReservationRecord`는 `{ id: string; name: string; email: string; utm?: ReservationUtm; reservedAt: string }`이고 `signal_type` 같은 필드는 없다.
- 기본값은 항상 `fixture`다. `CAMPAIGN_REPOSITORY_MODE=supabase`로 명시적으로 바꾸기 전까지 Supabase에 어떤 쓰기·읽기도 하지 않는다 (ADR-0014와 같은 이유 — 실수로 실제 프로젝트에 개발용 테스트 데이터가 쌓이는 것을 막는다).
- live 모드에서 이메일 dedupe는 서버 전용 `SIGNAL_HASH_SECRET`으로 만든 HMAC-SHA256 `email_hash`와 DB `unique` 제약으로 한다 (평문 이메일 자체에 unique를 걸지 않는다 — `docs/spec.md:439` 기존 결정).
- **실제 DB에 가짜 seed 예약자를 넣지 않는다.** fixture 모드의 "데모 데이터 초기화"는 seed 4건으로 되돌리지만, live 모드의 `reset`은 그냥 해당 캠페인의 예약을 전부 비운다 — 실제 고객 캠페인에 허위 데이터를 심는 건 `docs/validation.md`의 "측정값 진실성" 원칙과 충돌한다.
- `SUPABASE_SERVICE_ROLE_KEY`는 브라우저 번들과 `lib/supabase/server.ts`(사용자 세션 client) 어디에도 노출하지 않는다. 이 플랜에서 만드는 client는 `app/api/**/route.ts` 같은 서버 전용 코드에서만 import한다.
- 검증 명령은 이 머신에서 `npx pnpm@11.15.1 <script>` 형태로 실행한다 (`pnpm`이 전역 설치돼 있지 않다 — `TROUBLESHOOTING_A.md` 참고). Codex가 다른 머신에서 돌아간다면 이 접두사는 무시해도 된다.
- push 전에는 항상 `git fetch origin main && git log --oneline -5 origin/main`으로 상대(Claude Code 세션)가 그 사이에 push하지 않았는지 다시 확인한다. 오늘 이미 여러 번 이 저장소에서 두 세션이 겹친 적이 있다.

---

### Task 1: 문서 드리프트 수정 — `docs/spec.md`의 "데이터베이스" 섹션을 실제 코드 계약과 일치시킨다

**Files:**
- Modify: `docs/spec.md` (407-435번 줄 근처 "데이터베이스" 섹션)

- [ ] **Step 1: `signals` 테이블 정의를 실제 코드가 쓰는 `campaign_reservations`로 교체하고 `campaigns` 테이블도 함께 정리**

`old`:
```text
campaigns
- id uuid primary key
- draft_id uuid unique not null
- slug text unique not null
- spec jsonb not null
- status text not null
- next_action text null check in ('continue', 'revise', 'pause')
- created_at timestamptz
- updated_at timestamptz

signals
- id bigint generated identity primary key
- campaign_id uuid references campaigns(id)
- signal_type text not null check in ('problem_confirmation', 'solution_interest')
- name text not null
- email text not null
- email_hash text not null
- utm_source text
- utm_medium text
- utm_campaign text
- utm_content text
- created_at timestamptz
- unique (campaign_id, email_hash)
```

`new`:
```text
campaigns
- id uuid primary key
- draft_id text unique not null
- slug text unique not null
- spec jsonb not null
- next_action text null check in ('continue', 'revise', 'pause')
- published_at timestamptz not null
- created_at timestamptz not null default now()

campaign_reservations
- id uuid primary key
- campaign_id uuid references campaigns(id) on delete cascade
- name text not null
- email text not null
- email_hash text not null
- utm_source text
- utm_medium text
- utm_campaign text
- utm_content text
- reserved_at timestamptz not null default now()
- unique (campaign_id, email_hash)
```

- [ ] **Step 2: 바로 아래 남아있던 모순된 메모를 정리**

`old`:
```text
(ADR-0013로 `signal_response` 테이블을 `campaign_reservation`으로 대체했다. `option_id`·`anonymous_id_hash` 컬럼은 더 이상 사용하지 않는다.)
```

`new`:
```text
(ADR-0013으로 익명 3지선다 신호 테이블을 폐기하고 이름·이메일 기반 `campaign_reservations`를 도입했다. `campaigns` 테이블은 `PublishedCampaign` 계약과 1:1로 대응한다.)
```

- [ ] **Step 3: 커밋**

```bash
git add docs/spec.md
git commit -m "docs: DB 스키마 문서를 실제 코드 계약(ReservationRecord)과 재정렬"
```

---

### Task 2: Supabase 마이그레이션 SQL 작성 및 적용

**Files:**
- Create: `supabase/migrations/0001_campaigns_and_reservations.sql`

**Interfaces:**
- Produces: `public.campaigns`, `public.campaign_reservations` 테이블 — Task 5의 adapter가 이 스키마를 그대로 사용한다.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  draft_id text unique not null,
  slug text unique not null,
  spec jsonb not null,
  next_action text null check (next_action in ('continue', 'revise', 'pause')),
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.campaign_reservations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  email text not null,
  email_hash text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  reserved_at timestamptz not null default now(),
  unique (campaign_id, email_hash)
);

create index campaign_reservations_campaign_id_idx
  on public.campaign_reservations (campaign_id, reserved_at desc);

-- service-role 키만 이 테이블에 접근한다. RLS를 켜고 정책은 추가하지 않아
-- anon/authenticated 키로는 브라우저에서 직접 read/write가 전혀 안 되게 막는다.
alter table public.campaigns enable row level security;
alter table public.campaign_reservations enable row level security;
```

- [ ] **Step 2: Supabase Dashboard의 SQL Editor에서 위 SQL을 실행**

Google OAuth를 설정할 때 썼던 같은 프로젝트의 Supabase Dashboard → SQL Editor에 접속해 Step 1의 SQL 전체를 붙여넣고 실행한다. (이 프로젝트는 CLI로 링크돼 있지 않으므로 `supabase db push` 대신 Dashboard에서 직접 실행한다.) 실행 후 Table Editor에서 `campaigns`, `campaign_reservations` 두 테이블이 보이는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0001_campaigns_and_reservations.sql
git commit -m "feat: campaigns·campaign_reservations 테이블 마이그레이션 추가"
```

---

### Task 3: 서버 전용 Supabase service-role client

**Files:**
- Create: `lib/supabase/serviceClient.ts`
- Test: `tests/unit/supabaseServiceClient.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`(신규), `NEXT_PUBLIC_SUPABASE_URL`(기존, `lib/supabase/config.ts`가 이미 읽는 것과 같은 값)
- Produces: `createSupabaseServiceClient(): SupabaseClient` — Task 5의 adapter가 이 함수를 사용한다. `getSupabaseServiceConfig(environment?)`도 함께 export해 설정 누락을 명확한 에러로 던진다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";

import { getSupabaseServiceConfig, SupabaseServiceConfigError } from "@/lib/supabase/serviceClient";

describe("getSupabaseServiceConfig", () => {
  it("URL과 service role key가 모두 있으면 설정을 반환한다", () => {
    const config = getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
    expect(config).toEqual({ url: "https://example.supabase.co", serviceRoleKey: "service-role-key" });
  });

  it("service role key가 없으면 명확한 에러를 던진다", () => {
    expect(() => getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })).toThrow(SupabaseServiceConfigError);
  });

  it("URL이 없으면 명확한 에러를 던진다", () => {
    expect(() => getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    })).toThrow(SupabaseServiceConfigError);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/supabaseServiceClient.test.ts`
Expected: FAIL — `lib/supabase/serviceClient.ts`가 아직 없다.

- [ ] **Step 3: 구현 작성**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseServiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseServiceConfigError";
  }
}

export type SupabaseServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

type Environment = Record<string, string | undefined>;

function readNonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getSupabaseServiceConfig(
  environment: Environment = process.env,
): SupabaseServiceConfig {
  const url = readNonEmpty(environment.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = readNonEmpty(environment.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceRoleKey) {
    throw new SupabaseServiceConfigError(
      "NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 모두 설정해야 합니다.",
    );
  }

  return { url, serviceRoleKey };
}

let cachedClient: SupabaseClient | null = null;

/**
 * service-role 키는 RLS를 우회한다. 이 client는 Route Handler 같은
 * 서버 전용 코드에서만 import한다 — 브라우저 번들에 절대 포함하지 않는다.
 */
export function createSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/supabaseServiceClient.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/supabase/serviceClient.ts tests/unit/supabaseServiceClient.test.ts
git commit -m "feat: 서버 전용 Supabase service-role client 추가"
```

---

### Task 4: Repository 모드 설정 (`CAMPAIGN_REPOSITORY_MODE`)

**Files:**
- Create: `lib/demo/repositoryConfig.ts`
- Test: `tests/unit/repositoryConfig.test.ts`

**Interfaces:**
- Produces: `resolveCampaignRepositoryConfig(environment?): CampaignRepositoryConfig`, `CampaignRepositoryConfigError` — Task 6이 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";

import { CampaignRepositoryConfigError, resolveCampaignRepositoryConfig } from "@/lib/demo/repositoryConfig";

describe("resolveCampaignRepositoryConfig", () => {
  it("환경변수가 없으면 fixture 모드다", () => {
    expect(resolveCampaignRepositoryConfig({})).toEqual({ mode: "fixture" });
  });

  it("supabase 모드는 service role 설정이 있어야 한다", () => {
    expect(resolveCampaignRepositoryConfig({
      CAMPAIGN_REPOSITORY_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      SIGNAL_HASH_SECRET: "secret",
    })).toEqual({ mode: "supabase" });
  });

  it("supabase 모드인데 SIGNAL_HASH_SECRET이 없으면 거절한다", () => {
    expect(() => resolveCampaignRepositoryConfig({
      CAMPAIGN_REPOSITORY_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
    })).toThrow(CampaignRepositoryConfigError);
  });

  it("알 수 없는 모드는 거절한다", () => {
    expect(() => resolveCampaignRepositoryConfig({ CAMPAIGN_REPOSITORY_MODE: "postgres" }))
      .toThrow(CampaignRepositoryConfigError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/repositoryConfig.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

```ts
import { getSupabaseServiceConfig, SupabaseServiceConfigError } from "@/lib/supabase/serviceClient";

export type CampaignRepositoryMode = "fixture" | "supabase";
export type CampaignRepositoryConfig = { mode: CampaignRepositoryMode };

type Environment = Record<string, string | undefined>;

export class CampaignRepositoryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignRepositoryConfigError";
  }
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveCampaignRepositoryConfig(
  environment: Environment = process.env,
): CampaignRepositoryConfig {
  const mode = optionalValue(environment.CAMPAIGN_REPOSITORY_MODE) ?? "fixture";

  if (mode === "fixture") return { mode };
  if (mode !== "supabase") {
    throw new CampaignRepositoryConfigError(
      "CAMPAIGN_REPOSITORY_MODE는 fixture 또는 supabase여야 합니다.",
    );
  }

  try {
    getSupabaseServiceConfig(environment);
  } catch (error) {
    if (error instanceof SupabaseServiceConfigError) {
      throw new CampaignRepositoryConfigError(error.message);
    }
    throw error;
  }

  if (!optionalValue(environment.SIGNAL_HASH_SECRET)) {
    throw new CampaignRepositoryConfigError(
      "supabase 모드에는 서버 전용 SIGNAL_HASH_SECRET이 필요합니다.",
    );
  }

  return { mode: "supabase" };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/repositoryConfig.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/demo/repositoryConfig.ts tests/unit/repositoryConfig.test.ts
git commit -m "feat: CAMPAIGN_REPOSITORY_MODE 설정 해석기 추가"
```

---

### Task 5: `SupabaseCampaignRepository` 어댑터

**Files:**
- Create: `lib/supabase/campaignRepository.ts`
- Test: `tests/unit/supabaseCampaignRepository.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceClient` (Task 3), `CampaignRepository`·`ReservationInput`·`ReservationRecord`·`ReservationSummary`·`PublishedCampaign`·`DuplicateSignalError`·`CampaignNotFoundError`·`DraftConflictError`·`DraftOwnershipError` (`lib/contracts/repository.ts`, 이미 존재), `summarizeReservations` (`lib/demo/campaignReservations.ts`, 이미 존재)
- Produces: `SupabaseCampaignRepository` 클래스 — Task 6이 `fixture` 대신 이 클래스를 선택한다.

- [ ] **Step 1: 실패하는 테스트 작성 — Supabase client를 mock으로 주입**

이 테스트는 실제 네트워크 호출 없이 `SupabaseClient`의 최소 인터페이스만 mock한다.

```ts
import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignNotFoundError, DraftOwnershipError, DuplicateSignalError } from "@/lib/contracts/repository";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";
import { demoCampaign } from "@/lib/demo/demo-campaign";

function emailHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

describe("SupabaseCampaignRepository", () => {
  const secret = "test-secret";
  let rows: {
    campaigns: Array<{ id: string; draft_id: string; slug: string; spec: unknown; next_action: string | null; published_at: string }>;
    reservations: Array<{ id: string; campaign_id: string; name: string; email: string; email_hash: string; reserved_at: string }>;
  };

  function fakeClient() {
    return {
      from(table: "campaigns" | "campaign_reservations") {
        const source = table === "campaigns" ? rows.campaigns : rows.reservations;
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              maybeSingle: async () => ({
                data: source.find((row) => (row as Record<string, unknown>)[column] === value) ?? null,
                error: null,
              }),
              order: () => ({
                then: undefined,
                data: source.filter((row) => (row as Record<string, unknown>)[column] === value),
                error: null,
              }),
            }),
          }),
          insert: (values: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (table === "campaign_reservations") {
                  const duplicate = rows.reservations.some(
                    (row) => row.campaign_id === values.campaign_id && row.email_hash === values.email_hash,
                  );
                  if (duplicate) return { data: null, error: { code: "23505", message: "duplicate" } };
                }
                const row = { id: `generated-${source.length + 1}`, ...values } as never;
                source.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: (column: string, value: string) => ({
              select: () => ({
                single: async () => {
                  const row = source.find((item) => (item as Record<string, unknown>)[column] === value);
                  if (!row) return { data: null, error: { code: "PGRST116", message: "not found" } };
                  Object.assign(row, values);
                  return { data: row, error: null };
                },
              }),
            }),
          }),
          delete: () => ({
            eq: (column: string, value: string) => {
              rows[table === "campaigns" ? "campaigns" : "reservations"] =
                source.filter((row) => (row as Record<string, unknown>)[column] !== value) as never;
              return { then: (resolve: (value: { error: null }) => void) => resolve({ error: null }) };
            },
          }),
        };
      },
    };
  }

  beforeEach(() => {
    rows = { campaigns: [], reservations: [] };
  });

  it("게시-조회-예약-중복-초기화 흐름이 fixture와 같은 계약으로 동작한다", async () => {
    const repository = new SupabaseCampaignRepository({
      client: fakeClient() as never,
      hashSecret: secret,
      now: () => new Date("2026-08-25T00:00:00.000Z"),
    });

    const published = await repository.publish("draft-1", demoCampaign);
    expect(published.slug).toBeTruthy();

    const found = await repository.getById(published.id);
    expect(found?.spec.project.name).toBe(demoCampaign.project.name);

    const summary = await repository.recordReservation({
      campaignId: published.id,
      name: "테스트",
      email: "person@example.com",
      consent: true,
    });
    expect(summary.total).toBe(1);

    await expect(repository.recordReservation({
      campaignId: published.id,
      name: "테스트",
      email: "Person@Example.com",
      consent: true,
    })).rejects.toBeInstanceOf(DuplicateSignalError);

    await expect(repository.saveNextAction({ campaignId: published.id, draftId: "wrong", nextAction: "continue" }))
      .rejects.toBeInstanceOf(DraftOwnershipError);
    await repository.saveNextAction({ campaignId: published.id, draftId: "draft-1", nextAction: "continue" });

    const reset = await repository.reset({ campaignId: published.id, draftId: "draft-1" });
    expect(reset.nextAction).toBeNull();
    await expect(repository.getReservationSummary(published.id)).resolves.toMatchObject({ total: 0 });
  });

  it("없는 캠페인은 CampaignNotFoundError를 던진다", async () => {
    const repository = new SupabaseCampaignRepository({ client: fakeClient() as never, hashSecret: secret });
    await expect(repository.getReservationSummary("missing")).rejects.toBeInstanceOf(CampaignNotFoundError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/supabaseCampaignRepository.test.ts`
Expected: FAIL — `lib/supabase/campaignRepository.ts`가 아직 없다.

- [ ] **Step 3: 구현 작성**

```ts
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import {
  CampaignNotFoundError,
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
  type CampaignRepository,
  type DeleteCampaignInput,
  type NextActionInput,
  type PublishedCampaign,
  type ReservationInput,
  type ReservationRecord,
  type ReservationSummary,
  type ResetCampaignInput,
} from "@/lib/contracts/repository";
import { summarizeReservations } from "@/lib/demo/campaignReservations";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

type CampaignRow = {
  id: string;
  draft_id: string;
  slug: string;
  spec: CampaignSpec;
  next_action: PublishedCampaign["nextAction"];
  published_at: string;
};

type ReservationRow = {
  id: string;
  name: string;
  email: string;
  reserved_at: string;
};

const knownSlugBases: Record<string, string> = {
  "마감한입": "magamhanip",
  "동네공방 빈자리": "workshop-vacancy",
  "클래스 문의형": "class-inquiry",
};

function toPublishedCampaign(row: CampaignRow): PublishedCampaign {
  return {
    id: row.id,
    slug: row.slug,
    spec: campaignSpecSchema.parse(row.spec),
    publishedAt: row.published_at,
    nextAction: row.next_action,
  };
}

function isPostgresError(error: unknown): error is { code: string; message: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

export type SupabaseCampaignRepositoryOptions = {
  client?: SupabaseClient;
  hashSecret: string;
  now?: () => Date;
};

export class SupabaseCampaignRepository implements CampaignRepository {
  private readonly client: SupabaseClient;
  private readonly hashSecret: string;
  private readonly now: () => Date;

  constructor(options: SupabaseCampaignRepositoryOptions) {
    this.client = options.client ?? createSupabaseServiceClient();
    this.hashSecret = options.hashSecret;
    this.now = options.now ?? (() => new Date());
  }

  private emailHash(email: string): string {
    return createHmac("sha256", this.hashSecret).update(email.trim().toLowerCase()).digest("hex");
  }

  async publish(draftId: string, spec: CampaignSpec): Promise<PublishedCampaign> {
    const normalizedDraftId = draftId.trim();
    const parsedSpec = campaignSpecSchema.parse(spec);

    const { data: existing } = await this.client
      .from("campaigns")
      .select("*")
      .eq("draft_id", normalizedDraftId)
      .maybeSingle();

    if (existing) {
      const existingCampaign = toPublishedCampaign(existing as CampaignRow);
      if (JSON.stringify(existingCampaign.spec) !== JSON.stringify(parsedSpec)) {
        throw new DraftConflictError();
      }
      return existingCampaign;
    }

    const slugBase = knownSlugBases[parsedSpec.project.name] ?? "campaign";
    const slug = await this.uniqueSlug(slugBase);
    const { data, error } = await this.client
      .from("campaigns")
      .insert({
        draft_id: normalizedDraftId,
        slug,
        spec: parsedSpec,
        next_action: null,
        published_at: this.now().toISOString(),
      })
      .select()
      .single();

    if (error || !data) throw new Error(`campaign publish failed: ${error?.message}`);
    return toPublishedCampaign(data as CampaignRow);
  }

  async getById(id: string): Promise<PublishedCampaign | null> {
    const { data } = await this.client.from("campaigns").select("*").eq("id", id).maybeSingle();
    return data ? toPublishedCampaign(data as CampaignRow) : null;
  }

  async getBySlug(slug: string): Promise<PublishedCampaign | null> {
    const { data } = await this.client.from("campaigns").select("*").eq("slug", slug).maybeSingle();
    return data ? toPublishedCampaign(data as CampaignRow) : null;
  }

  async recordReservation(input: ReservationInput): Promise<ReservationSummary> {
    await this.requireCampaignRow(input.campaignId);
    const emailHash = this.emailHash(input.email);

    const { error } = await this.client
      .from("campaign_reservations")
      .insert({
        campaign_id: input.campaignId,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        email_hash: emailHash,
        utm_source: input.utm?.source ?? null,
        utm_medium: input.utm?.medium ?? null,
        utm_campaign: input.utm?.campaign ?? null,
        utm_content: input.utm?.content ?? null,
        reserved_at: this.now().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (isPostgresError(error) && error.code === "23505") throw new DuplicateSignalError();
      throw new Error(`reservation insert failed: ${error.message}`);
    }

    return this.getReservationSummary(input.campaignId);
  }

  async getReservationSummary(campaignId: string): Promise<ReservationSummary> {
    await this.requireCampaignRow(campaignId);
    const { data } = await this.client
      .from("campaign_reservations")
      .select("id, name, email, reserved_at")
      .eq("campaign_id", campaignId)
      .order("reserved_at", { ascending: false });

    const records: ReservationRecord[] = ((data ?? []) as ReservationRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      reservedAt: row.reserved_at,
    }));
    return summarizeReservations(records);
  }

  async saveNextAction(input: NextActionInput): Promise<NextActionInput["nextAction"]> {
    const campaign = await this.requireCampaignRow(input.campaignId);
    this.assertDraftOwnership(campaign, input.draftId);

    const { error } = await this.client
      .from("campaigns")
      .update({ next_action: input.nextAction })
      .eq("id", input.campaignId)
      .select()
      .single();
    if (error) throw new Error(`saveNextAction failed: ${error.message}`);
    return input.nextAction;
  }

  async delete(input: DeleteCampaignInput): Promise<void> {
    const campaign = await this.getById(input.campaignId);
    if (!campaign) return;
    const row = await this.requireCampaignRow(input.campaignId);
    this.assertDraftOwnership(row, input.draftId);
    await this.client.from("campaigns").delete().eq("id", input.campaignId);
  }

  async reset(input: ResetCampaignInput): Promise<PublishedCampaign> {
    const row = await this.requireCampaignRow(input.campaignId);
    this.assertDraftOwnership(row, input.draftId);

    await this.client.from("campaign_reservations").delete().eq("campaign_id", input.campaignId);
    const { data, error } = await this.client
      .from("campaigns")
      .update({ next_action: null })
      .eq("id", input.campaignId)
      .select()
      .single();
    if (error || !data) throw new Error(`reset failed: ${error?.message}`);
    return toPublishedCampaign(data as CampaignRow);
  }

  private async requireCampaignRow(id: string): Promise<CampaignRow> {
    const { data } = await this.client.from("campaigns").select("*").eq("id", id).maybeSingle();
    if (!data) throw new CampaignNotFoundError();
    return data as CampaignRow;
  }

  private assertDraftOwnership(campaign: CampaignRow, draftId: string): void {
    if (campaign.draft_id !== draftId.trim()) throw new DraftOwnershipError();
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (await this.getBySlug(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx pnpm@11.15.1 exec vitest run tests/unit/supabaseCampaignRepository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/supabase/campaignRepository.ts tests/unit/supabaseCampaignRepository.test.ts
git commit -m "feat: SupabaseCampaignRepository 어댑터 구현"
```

---

### Task 6: repository 선택을 모드 인식으로 교체

**Files:**
- Modify: `lib/demo/repository.ts`

**Interfaces:**
- Consumes: `resolveCampaignRepositoryConfig` (Task 4), `SupabaseCampaignRepository` (Task 5)

- [ ] **Step 1: 현재 파일 전체를 읽고, fixture 전용 singleton을 모드 분기로 교체**

`old` (현재 전체 내용):
```ts
import type { CampaignRepository } from "@/lib/contracts/repository";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";

/**
 * fixture 모드는 서버 프로세스 메모리만 사용한다. 서버 재시작이나 serverless 인스턴스 전환
 * 뒤에는 초기 상태로 돌아가며, 실제 다중 기기 저장은 다음 Supabase adapter가 담당한다.
 */
const fixtureGlobal = globalThis as typeof globalThis & {
  __marketvalleyFixtureCampaignRepositoryV5?: FixtureCampaignRepository;
};

export const fixtureCampaignRepository =
  fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV5
  ?? new FixtureCampaignRepository();

fixtureGlobal.__marketvalleyFixtureCampaignRepositoryV5 = fixtureCampaignRepository;

export const campaignRepository: CampaignRepository = fixtureCampaignRepository;
```

`new`:
```ts
import type { CampaignRepository } from "@/lib/contracts/repository";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";
import { resolveCampaignRepositoryConfig } from "@/lib/demo/repositoryConfig";
import { SupabaseCampaignRepository } from "@/lib/supabase/campaignRepository";

/**
 * fixture 모드는 서버 프로세스 메모리만 사용한다. 서버 재시작이나 serverless 인스턴스 전환
 * 뒤에는 초기 상태로 돌아간다. CAMPAIGN_REPOSITORY_MODE=supabase일 때만 실제 DB를 쓴다.
 */
const repositoryGlobal = globalThis as typeof globalThis & {
  __marketvalleyCampaignRepositoryV1?: CampaignRepository;
};

function createCampaignRepository(): CampaignRepository {
  const config = resolveCampaignRepositoryConfig();
  if (config.mode === "fixture") return new FixtureCampaignRepository();
  return new SupabaseCampaignRepository({ hashSecret: process.env.SIGNAL_HASH_SECRET! });
}

export const campaignRepository: CampaignRepository =
  repositoryGlobal.__marketvalleyCampaignRepositoryV1 ?? createCampaignRepository();

repositoryGlobal.__marketvalleyCampaignRepositoryV1 = campaignRepository;
```

- [ ] **Step 2: 타입체크로 확인 (이 파일은 단위 테스트가 없다 — 기존 fixtureRepository 테스트가 간접적으로 이 모듈을 통과해야 한다)**

Run: `npx pnpm@11.15.1 typecheck && npx pnpm@11.15.1 test`
Expected: 둘 다 PASS. 환경변수를 아무것도 안 주면 `resolveCampaignRepositoryConfig()`가 `fixture`를 반환하므로 기존 동작이 그대로 유지된다.

- [ ] **Step 3: 커밋**

```bash
git add lib/demo/repository.ts
git commit -m "feat: repository 선택을 CAMPAIGN_REPOSITORY_MODE 기준으로 전환"
```

---

### Task 7: 환경변수 예시와 ADR 추가

**Files:**
- Modify: `.env.example`
- Create: `docs/decisions/0015-gate-supabase-repository-behind-explicit-mode.md`

- [ ] **Step 1: `.env.example`에 새 변수 추가**

`old`:
```dotenv
# 개발·발표 기본값은 외부 호출과 과금이 없는 fixture다.
CAMPAIGN_GENERATOR_MODE=fixture
```

`new`:
```dotenv
# 개발·발표 기본값은 외부 호출과 과금이 없는 fixture다.
CAMPAIGN_GENERATOR_MODE=fixture
# 개발·발표 기본값은 서버 메모리(fixture)다. supabase로 바꾸면 실제 프로젝트에 쓴다.
CAMPAIGN_REPOSITORY_MODE=fixture
# supabase 모드에만 필요하다. 브라우저와 인증 route는 이 키를 쓰지 않는다.
SUPABASE_SERVICE_ROLE_KEY=
```

`.env.example`에 이미 있는 `SUPABASE_SERVICE_ROLE_KEY=` 줄이 있다면 중복 추가하지 말고 위치만 `CAMPAIGN_REPOSITORY_MODE` 옆으로 옮긴다.

- [ ] **Step 2: ADR 작성** (ADR-0014와 같은 톤·구조)

```markdown
# ADR-0015: Supabase repository도 명시적 모드 전환 뒤에만 사용한다

상태: 채택

기준일: 2026-08-25

## 배경

`CampaignRepository`의 Supabase 구현체가 준비됐다. 이미 검증된 프로젝트가 있다고 해서
기본값을 자동으로 `supabase`로 바꾸면, 로컬 개발이나 자동 테스트 중에 실제 프로젝트에
테스트 캠페인·예약자가 계속 쌓인다. ADR-0014가 AI 생성기에 적용한 것과 같은 문제다.

## 결정

- `CAMPAIGN_REPOSITORY_MODE`의 기본값은 `fixture`다. 환경변수로 명시적으로 `supabase`로
  바꾸기 전까지 서버 프로세스 메모리만 사용한다.
- `supabase` 모드는 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SIGNAL_HASH_SECRET`이 모두 있어야 켜진다 — 하나라도 없으면 서버 시작 시점에
  `CampaignRepositoryConfigError`로 명확히 실패한다.
- live 모드의 `reset`은 fixture처럼 가짜 seed 예약자를 다시 넣지 않는다. 실제 캠페인에
  허위 데이터를 심는 건 `docs/validation.md`의 측정값 진실성 원칙과 충돌하기 때문이다 —
  단순히 해당 캠페인의 예약을 전부 비운다.
- 이메일 dedupe는 평문이 아니라 서버 전용 `SIGNAL_HASH_SECRET`으로 만든 HMAC 해시에
  DB unique 제약을 건다.

## 결과

`campaigns`·`campaign_reservations` 테이블과 `SupabaseCampaignRepository`가 구현됐지만,
발표·개발 기본 경로는 여전히 `fixture`다. 실제 다중 기기 데모나 프로덕션 배포 시점에만
`CAMPAIGN_REPOSITORY_MODE=supabase`로 전환한다.
```

- [ ] **Step 3: 커밋**

```bash
git add .env.example docs/decisions/0015-gate-supabase-repository-behind-explicit-mode.md
git commit -m "docs: Supabase repository 모드 게이팅을 ADR-0015로 기록"
```

---

### Task 8: 전체 검증과 push

**Files:**
- 없음 (검증 전용)

- [ ] **Step 1: 전체 검증 스위트**

Run: `npx pnpm@11.15.1 check`
Expected: lint, typecheck, 단위 테스트(신규 9개 포함) 모두 PASS, production build 성공. **`CAMPAIGN_REPOSITORY_MODE`를 설정하지 않은 기본 상태로 실행하므로 fixture 모드로 빌드·테스트된다 — 이 단계에서 실제 Supabase에 쓰기가 일어나지 않는다.**

- [ ] **Step 2: (선택, 실제 프로젝트 자격증명이 있는 사람만) 로컬에서 live 모드 수동 스모크 테스트**

`.env.local`에 `CAMPAIGN_REPOSITORY_MODE=supabase`, `SUPABASE_SERVICE_ROLE_KEY`, `SIGNAL_HASH_SECRET`을 채운 뒤 `npx pnpm@11.15.1 dev`로 서버를 띄우고, `/new`에서 광고를 하나 만들어 게시 → 공개 랜딩에서 예약 제출 → Supabase Table Editor에서 `campaigns`·`campaign_reservations`에 실제 행이 생겼는지 확인한다. 이 단계는 실제 프로젝트에 데이터를 남기므로, 테스트가 끝나면 Table Editor에서 테스트 행을 직접 지운다.

- [ ] **Step 3: origin/main 재확인 후 push**

```bash
git fetch origin main
git log --oneline -5 origin/main
```

로컬과 다른 커밋이 있으면 겹치는 파일을 확인(`git diff --stat HEAD origin/main`)한 뒤 병합하고 `npx pnpm@11.15.1 check`를 다시 통과시킨다. 겹치는 파일이 있고 자동 병합이 애매하면 push하지 말고 사용자에게 보고한다.

```bash
git push origin main
```

- [ ] **Step 4: WORKLOG_A.md에 결과 기록**

```markdown
## 2026-08-25 — B-1: Supabase CampaignRepository 어댑터 구현

- 목적: fixture 서버 메모리를 대체할 실제 Supabase 어댑터를 만들어 다중 기기 데모·실제 예약자 저장을 가능하게 한다
- 변경: campaigns·campaign_reservations 테이블 마이그레이션, 서버 전용 service-role client, CAMPAIGN_REPOSITORY_MODE 모드 게이팅(ADR-0015), SupabaseCampaignRepository 전체 CampaignRepository 구현. docs/spec.md의 드리프트된 DB 스키마 문서를 실제 코드 계약과 재정렬
- 영향 범위: supabase/migrations/, lib/supabase/serviceClient.ts, lib/supabase/campaignRepository.ts, lib/demo/repositoryConfig.ts, lib/demo/repository.ts, .env.example, docs/decisions/0015-*.md, docs/spec.md
- 결정: 기본값은 계속 fixture. live 모드의 reset은 가짜 seed를 넣지 않고 그냥 비운다
- 검증: pnpm check(lint·typecheck·단위 테스트·build) 통과, fixture 기본 경로는 변경 없음
- 전달: [실제 커밋 해시로 채운다]
- 남은 일: 실제 Supabase 프로젝트에서 live 모드 수동 스모크 테스트(Task 8 Step 2)는 자격증명을 가진 사람이 별도로 진행
```

## Self-Review 메모 (Codex가 실행 전 참고)

- Task 5의 mock `fakeClient()`는 Supabase JS client의 실제 타입과 완전히 같지 않다 — `as never`로 캐스팅한 이유다. 실제 타입 불일치로 컴파일이 안 되면, 그 부분만 `@supabase/supabase-js`의 실제 반환 타입에 맞춰 목을 조정해도 된다. 테스트가 검증하는 것은 **어댑터의 동작**(중복 거절, 소유권 검증, 캠페인 없음 처리)이지 mock의 타입 완전성이 아니다.
- `SupabaseCampaignRepository`의 `publish`는 `fingerprint` 대신 `JSON.stringify` 직접 비교를 쓴다 — fixture의 `fingerprint()` 함수와 동일한 방식이라 결과가 같다.
- Task 6에서 `process.env.SIGNAL_HASH_SECRET!`을 쓰는 이유: `resolveCampaignRepositoryConfig()`가 이미 `supabase` 모드일 때 이 값의 존재를 검증했으므로, 그 검증을 통과한 뒤에는 항상 값이 있다.
