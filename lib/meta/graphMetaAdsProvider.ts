import "server-only";

import { createHmac } from "node:crypto";

import {
  META_GRAPH_API_VERSION,
  assertPausedStatus,
  assertSafeExternalId,
  META_REQUIRED_IMAGE_COUNT,
  type MetaAdPayload,
  type MetaAdsProvider,
  type MetaAdSetPayload,
  type MetaCampaignPayload,
  type MetaCarouselCreativePayload,
  type MetaConfiguredBinding,
  MetaConfigurationError,
  MetaInputError,
  type MetaPngAsset,
  validateConfiguredBinding,
  validateDestinationUrl,
  validateMetaPngAsset,
} from "@/lib/meta/contracts";

type FetchImplementation = typeof fetch;

type GraphErrorBody = {
  error?: {
    code?: unknown;
    error_subcode?: unknown;
    fbtrace_id?: unknown;
  };
};

export class MetaGraphApiError extends Error {
  readonly httpStatus: number;
  readonly graphCode: number | null;
  readonly graphSubcode: number | null;
  readonly traceId: string | null;

  constructor(options: {
    httpStatus: number;
    graphCode?: number | null;
    graphSubcode?: number | null;
    traceId?: string | null;
  }) {
    super("Meta Marketing API 요청에 실패했습니다.");
    this.name = "MetaGraphApiError";
    this.httpStatus = options.httpStatus;
    this.graphCode = options.graphCode ?? null;
    this.graphSubcode = options.graphSubcode ?? null;
    this.traceId = options.traceId ?? null;
  }
}

export class MetaGraphTransportError extends Error {
  constructor() {
    super("Meta Marketing API에 연결하지 못했습니다.");
    this.name = "MetaGraphTransportError";
  }
}

export class MetaGraphProtocolError extends Error {
  constructor() {
    super("Meta Marketing API 응답 형식이 올바르지 않습니다.");
    this.name = "MetaGraphProtocolError";
  }
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function safeTraceId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function graphObjectId(label: string, value: unknown): string {
  if (typeof value !== "string") throw new MetaGraphProtocolError();
  return assertSafeExternalId(label, value);
}

function createForm(fields: Record<string, string>): URLSearchParams {
  const form = new URLSearchParams();
  Object.entries(fields).forEach(([name, value]) => form.set(name, value));
  return form;
}

function graphInteger(value: unknown): number {
  const normalized = typeof value === "number" ? String(value) : value;
  if (typeof normalized !== "string" || !/^\d+$/u.test(normalized)) {
    throw new MetaGraphProtocolError();
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) throw new MetaGraphProtocolError();
  return parsed;
}

function graphMoneyMinor(value: unknown, currency: string): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/u.test(value)) {
    throw new MetaGraphProtocolError();
  }
  const multiplier = currency === "KRW" ? 1 : 100;
  const parsed = Math.round(Number(value) * multiplier);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new MetaGraphProtocolError();
  return parsed;
}

export type MetaAccountReadiness = {
  adAccountId: string;
  accountStatus: number;
  disableReason: number;
  currency: string;
  amountSpentMinor: number;
  balanceMinor: number;
  hasFundingSource: boolean;
};

export type MetaObjectStatus = {
  id: string;
  configuredStatus: string;
  effectiveStatus: string;
};

export type MetaInsights = {
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  spendMinor: number;
  currency: string;
  dateStart: string;
  dateStop: string;
};

export type GraphMetaAdsProviderOptions = {
  binding: MetaConfiguredBinding;
  accessToken: string;
  appSecret: string;
  verifiedPageInstagramBinding: {
    pageId: string;
    instagramActorId: string;
    verifiedAt: string;
  };
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

/** A single-attempt, account-bound Graph API v26.0 adapter. */
export class GraphMetaAdsProvider implements MetaAdsProvider {
  private readonly binding: MetaConfiguredBinding;
  private readonly accessToken: string;
  private readonly appSecretProof: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: GraphMetaAdsProviderOptions) {
    this.binding = validateConfiguredBinding(options.binding);
    if (
      options.verifiedPageInstagramBinding.pageId !== this.binding.pageId ||
      options.verifiedPageInstagramBinding.instagramActorId !== this.binding.instagramActorId ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
        options.verifiedPageInstagramBinding.verifiedAt,
      ) ||
      !Number.isFinite(Date.parse(options.verifiedPageInstagramBinding.verifiedAt)) ||
      new Date(options.verifiedPageInstagramBinding.verifiedAt).toISOString() !==
        options.verifiedPageInstagramBinding.verifiedAt
    ) {
      throw new MetaConfigurationError("Meta Page–Instagram 운영자 확인 기록이 설정과 일치하지 않습니다.");
    }
    const accessToken = options.accessToken.trim();
    if (accessToken.length < 20 || /[\u0000-\u001f\u007f]/u.test(accessToken)) {
      throw new MetaConfigurationError("Meta access token이 설정되지 않았거나 올바르지 않습니다.");
    }
    this.accessToken = accessToken;
    const appSecret = options.appSecret.trim();
    if (appSecret.length < 16 || /[\u0000-\u001f\u007f]/u.test(appSecret)) {
      throw new MetaConfigurationError("Meta app secret이 설정되지 않았거나 올바르지 않습니다.");
    }
    this.appSecretProof = createHmac("sha256", appSecret).update(accessToken).digest("hex");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 60_000) {
      throw new MetaConfigurationError("Meta 요청 timeout이 올바르지 않습니다.");
    }
  }

  async verifyConfiguredAssets(): Promise<void> {
    const account = objectRecord(
      await this.request(`act_${this.binding.adAccountId}`, {
        method: "GET",
        query: { fields: "id" },
      }),
    );
    if (account?.id !== `act_${this.binding.adAccountId}`) {
      throw new MetaConfigurationError("연결된 Meta ad account를 확인할 수 없습니다.");
    }

    const page = objectRecord(
      await this.request(this.binding.pageId, {
        method: "GET",
        query: { fields: "id,instagram_business_account{id}" },
      }),
    );
    if (page?.id !== this.binding.pageId) {
      throw new MetaConfigurationError("설정된 Meta Page를 확인할 수 없습니다.");
    }
    if (
      objectRecord(page.instagram_business_account)?.id !== this.binding.instagramActorId
    ) {
      throw new MetaConfigurationError(
        "설정된 Meta Page와 Instagram identity의 연결을 확인할 수 없습니다.",
      );
    }

    const instagramAccounts = objectRecord(
      await this.request(`act_${this.binding.adAccountId}/instagram_accounts`, {
        method: "GET",
        query: { fields: "id", limit: "100" },
      }),
    )?.data;
    if (!Array.isArray(instagramAccounts) || !instagramAccounts.some((value) => (
      objectRecord(value)?.id === this.binding.instagramActorId
    ))) {
      throw new MetaConfigurationError("설정된 Meta Instagram identity를 ad account에서 사용할 수 없습니다.");
    }
  }

  async uploadImage(image: MetaPngAsset): Promise<string> {
    validateMetaPngAsset(image);
    const form = new FormData();
    const uploadBytes = Uint8Array.from(image.bytes).buffer;
    form.set("filename", new Blob([uploadBytes], { type: image.contentType }), image.filename);
    const response = objectRecord(
      await this.request(`act_${this.binding.adAccountId}/adimages`, {
        method: "POST",
        body: form,
      }),
    );
    const images = objectRecord(response?.images);
    const namedImage = objectRecord(images?.[image.filename]);
    const onlyImage = images && Object.keys(images).length === 1
      ? objectRecord(Object.values(images)[0])
      : null;
    return graphObjectId("Meta image hash", (namedImage ?? onlyImage)?.hash);
  }

  async createCampaign(payload: MetaCampaignPayload): Promise<string> {
    assertPausedStatus(payload.status);
    return this.createObject("campaigns", createForm({
      name: payload.name,
      status: payload.status,
      objective: payload.objective,
      buying_type: payload.buyingType,
      special_ad_categories: JSON.stringify(payload.specialAdCategories),
      is_adset_budget_sharing_enabled: "false",
    }), "Meta campaign ID");
  }

  async createAdSet(payload: MetaAdSetPayload): Promise<string> {
    assertPausedStatus(payload.status);
    assertSafeExternalId("Meta campaign ID", payload.campaignId);
    if (
      !Number.isSafeInteger(payload.lifetimeBudgetMinor) ||
      payload.lifetimeBudgetMinor < 100 ||
      payload.lifetimeBudgetMinor > this.binding.maxLifetimeBudgetMinor
    ) {
      throw new MetaInputError("Meta lifetime budget이 서버 안전 한도를 벗어났습니다.");
    }
    return this.createObject("adsets", createForm({
      name: payload.name,
      status: payload.status,
      campaign_id: payload.campaignId,
      billing_event: payload.billingEvent,
      optimization_goal: payload.optimizationGoal,
      bid_strategy: payload.bidStrategy,
      lifetime_budget: String(payload.lifetimeBudgetMinor),
      start_time: payload.startsAt,
      end_time: payload.endsAt,
      targeting: JSON.stringify({
        age_min: payload.targeting.ageMin,
        age_max: payload.targeting.ageMax,
        geo_locations: {
          countries: payload.targeting.countries,
          location_types: ["home", "recent"],
        },
      }),
    }), "Meta ad set ID");
  }

  async createCarouselCreative(payload: MetaCarouselCreativePayload): Promise<string> {
    const destinationUrl = validateDestinationUrl(payload.destinationUrl, this.binding);
    if (payload.cards.length !== META_REQUIRED_IMAGE_COUNT) {
      throw new MetaInputError("Meta 캐러셀에는 카드가 정확히 5개 필요합니다.");
    }
    payload.cards.forEach((card) => assertSafeExternalId("Meta image hash", card.imageHash));
    const callToAction = {
      type: "LEARN_MORE",
      value: { link: destinationUrl },
    };
    const objectStorySpec = {
      page_id: this.binding.pageId,
      instagram_user_id: this.binding.instagramActorId,
      link_data: {
        link: destinationUrl,
        message: payload.message,
        name: payload.headline,
        call_to_action: callToAction,
        multi_share_optimized: false,
        child_attachments: payload.cards.map((card) => ({
          link: destinationUrl,
          image_hash: card.imageHash,
          name: card.headline,
          description: card.description,
          call_to_action: callToAction,
        })),
      },
    };
    return this.createObject("adcreatives", createForm({
      name: payload.name,
      object_story_spec: JSON.stringify(objectStorySpec),
    }), "Meta creative ID");
  }

  async createAd(payload: MetaAdPayload): Promise<string> {
    assertPausedStatus(payload.status);
    assertSafeExternalId("Meta ad set ID", payload.adSetId);
    assertSafeExternalId("Meta creative ID", payload.creativeId);
    return this.createObject("ads", createForm({
      name: payload.name,
      status: payload.status,
      adset_id: payload.adSetId,
      creative: JSON.stringify({ creative_id: payload.creativeId }),
    }), "Meta ad ID");
  }

  async getAccountReadiness(): Promise<MetaAccountReadiness> {
    const body = objectRecord(await this.request(`act_${this.binding.adAccountId}`, {
      method: "GET",
      query: {
        fields: "id,account_status,disable_reason,currency,amount_spent,balance,funding_source",
      },
    }));
    if (body?.id !== `act_${this.binding.adAccountId}` || typeof body.currency !== "string") {
      throw new MetaGraphProtocolError();
    }
    const currency = body.currency;
    if (!/^[A-Z]{3}$/u.test(currency)) throw new MetaGraphProtocolError();
    return {
      adAccountId: this.binding.adAccountId,
      accountStatus: graphInteger(body.account_status),
      disableReason: graphInteger(body.disable_reason ?? 0),
      currency,
      amountSpentMinor: graphInteger(body.amount_spent ?? "0"),
      balanceMinor: graphInteger(body.balance ?? "0"),
      hasFundingSource: typeof body.funding_source === "string" && /^\d{5,32}$/u.test(body.funding_source),
    };
  }

  async setObjectStatus(objectId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
    assertSafeExternalId("Meta object ID", objectId);
    const body = objectRecord(await this.request(objectId, {
      method: "POST",
      body: createForm({ status }),
    }));
    if (body?.success !== true) throw new MetaGraphProtocolError();
  }

  async getObjectStatus(objectId: string): Promise<MetaObjectStatus> {
    assertSafeExternalId("Meta object ID", objectId);
    const body = objectRecord(await this.request(objectId, {
      method: "GET",
      query: { fields: "id,configured_status,effective_status" },
    }));
    if (
      body?.id !== objectId ||
      typeof body.configured_status !== "string" ||
      typeof body.effective_status !== "string"
    ) throw new MetaGraphProtocolError();
    return {
      id: objectId,
      configuredStatus: body.configured_status,
      effectiveStatus: body.effective_status,
    };
  }

  async getInsights(options: {
    objectId: string;
    startsAt: string;
    endsAt: string;
  }): Promise<MetaInsights> {
    assertSafeExternalId("Meta object ID", options.objectId);
    const readiness = await this.getAccountReadiness();
    const start = new Date(options.startsAt);
    const end = new Date(options.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new MetaInputError("Meta Insights 집계 기간이 올바르지 않습니다.");
    }
    const since = start.toISOString().slice(0, 10);
    const until = new Date(Math.min(Date.now(), end.getTime())).toISOString().slice(0, 10);
    const body = objectRecord(await this.request(`${options.objectId}/insights`, {
      method: "GET",
      query: {
        fields: "impressions,reach,clicks,inline_link_clicks,spend,date_start,date_stop",
        time_range: JSON.stringify({ since, until }),
        level: "campaign",
        limit: "1",
      },
    }));
    const rows = body?.data;
    if (!Array.isArray(rows)) throw new MetaGraphProtocolError();
    if (rows.length === 0) {
      return {
        impressions: 0,
        reach: 0,
        clicks: 0,
        linkClicks: 0,
        spendMinor: 0,
        currency: readiness.currency,
        dateStart: since,
        dateStop: until,
      };
    }
    const row = objectRecord(rows[0]);
    if (!row || typeof row.date_start !== "string" || typeof row.date_stop !== "string") {
      throw new MetaGraphProtocolError();
    }
    return {
      impressions: graphInteger(row.impressions ?? "0"),
      reach: graphInteger(row.reach ?? "0"),
      clicks: graphInteger(row.clicks ?? "0"),
      linkClicks: graphInteger(row.inline_link_clicks ?? "0"),
      spendMinor: graphMoneyMinor(row.spend ?? "0", readiness.currency),
      currency: readiness.currency,
      dateStart: row.date_start,
      dateStop: row.date_stop,
    };
  }

  private async createObject(edge: string, body: URLSearchParams, label: string): Promise<string> {
    const response = objectRecord(
      await this.request(`act_${this.binding.adAccountId}/${edge}`, { method: "POST", body }),
    );
    return graphObjectId(label, response?.id);
  }

  private async request(
    path: string,
    options: {
      method: "GET" | "POST";
      query?: Record<string, string>;
      body?: BodyInit;
    },
  ): Promise<unknown> {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${path}`);
    Object.entries(options.query ?? {}).forEach(([name, value]) => url.searchParams.set(name, value));
    url.searchParams.set("appsecret_proof", this.appSecretProof);
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: options.method,
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: options.body,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MetaGraphTransportError();
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch {
      throw new MetaGraphProtocolError();
    }
    if (bodyText.length > 64 * 1024) throw new MetaGraphProtocolError();

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      if (response.ok) throw new MetaGraphProtocolError();
      throw new MetaGraphApiError({ httpStatus: response.status });
    }
    if (!response.ok) {
      const graphError = (parsed as GraphErrorBody)?.error;
      throw new MetaGraphApiError({
        httpStatus: response.status,
        graphCode: safeInteger(graphError?.code),
        graphSubcode: safeInteger(graphError?.error_subcode),
        traceId: safeTraceId(graphError?.fbtrace_id),
      });
    }
    return parsed;
  }
}
