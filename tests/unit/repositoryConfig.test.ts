import { describe, expect, it } from "vitest";

import {
  CampaignRepositoryConfigError,
  resolveCampaignRepositoryMode,
} from "@/lib/demo/repositoryConfig";

const liveEnvironment = {
  CAMPAIGN_REPOSITORY_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  SIGNAL_HASH_SECRET: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://marketvalley.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-test-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret-test-key",
};

describe("campaign repository config", () => {
  it("기본값은 외부 DB를 쓰지 않는 fixture다", () => {
    expect(resolveCampaignRepositoryMode({})).toBe("fixture");
  });

  it("모든 server-only 설정이 있는 경우에만 supabase 모드를 연다", () => {
    expect(resolveCampaignRepositoryMode(liveEnvironment)).toBe("supabase");
  });

  it("짧은 HMAC secret과 알 수 없는 모드를 거절한다", () => {
    expect(() => resolveCampaignRepositoryMode({
      ...liveEnvironment,
      SIGNAL_HASH_SECRET: "short",
    })).toThrow(CampaignRepositoryConfigError);
    expect(() => resolveCampaignRepositoryMode({
      CAMPAIGN_REPOSITORY_MODE: "postgres",
    })).toThrow(CampaignRepositoryConfigError);
    expect(() => resolveCampaignRepositoryMode({
      ...liveEnvironment,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    })).toThrow(CampaignRepositoryConfigError);
    expect(() => resolveCampaignRepositoryMode({
      ...liveEnvironment,
      NEXT_PUBLIC_SITE_URL: "http://marketvalley.example.com",
    })).toThrow(CampaignRepositoryConfigError);
    expect(() => resolveCampaignRepositoryMode({
      ...liveEnvironment,
      RESERVATION_CAMPAIGN_MINUTE_LIMIT: "121",
      RESERVATION_GLOBAL_MINUTE_LIMIT: "120",
    })).toThrow(CampaignRepositoryConfigError);
  });
});
