import { describe, expect, it } from "vitest";

import { resolveAuthMode } from "@/lib/auth/mode";

describe("auth mode", () => {
  it("발표용 mock 모드는 Supabase 설정과 무관하게 명시적으로 선택한다", () => {
    expect(resolveAuthMode({ NEXT_PUBLIC_AUTH_MODE: "mock" })).toBe("mock");
    expect(resolveAuthMode({
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    })).toBe("mock");
  });

  it("실제 설정은 Supabase를 사용하고 설정이 없으면 인증을 비활성화한다", () => {
    expect(resolveAuthMode({
      NEXT_PUBLIC_AUTH_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    })).toBe("supabase");
    expect(resolveAuthMode({})).toBe("disabled");
  });
});
