import { describe, expect, it } from "vitest";

import {
  getSupabaseServiceConfig,
  SupabaseServiceConfigError,
} from "@/lib/supabase/serviceClient";

describe("Supabase service client config", () => {
  it("새 secret key를 legacy service role key보다 우선한다", () => {
    expect(getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/path",
      SUPABASE_SECRET_KEY: "sb_secret_primary",
      SUPABASE_SERVICE_ROLE_KEY: "legacy",
    })).toEqual({
      url: "https://project.supabase.co",
      serverKey: "sb_secret_primary",
    });
  });

  it("legacy service role key를 호환한다", () => {
    expect(getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "legacy",
    })).toEqual({ url: "http://127.0.0.1:54321", serverKey: "legacy" });
  });

  it("키 누락과 안전하지 않은 원격 URL을 거절한다", () => {
    expect(() => getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    })).toThrow(SupabaseServiceConfigError);
    expect(() => getSupabaseServiceConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://example.com",
      SUPABASE_SECRET_KEY: "secret",
    })).toThrow(SupabaseServiceConfigError);
  });
});
