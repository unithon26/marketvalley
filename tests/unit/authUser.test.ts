import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { toAuthUser } from "@/lib/auth/user";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    app_metadata: { provider: "google" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("toAuthUser", () => {
  it("화면에 필요한 최소 사용자 정보만 반환한다", () => {
    const user = makeUser({
      email: "owner@example.com",
      user_metadata: {
        full_name: "  홍   성주 ",
        avatar_url: "https://images.example.com/avatar.png",
        provider_token: "never-expose-this",
      },
    });

    expect(toAuthUser(user)).toEqual({
      id: "user-1",
      email: "owner@example.com",
      displayName: "홍 성주",
      avatarUrl: "https://images.example.com/avatar.png",
    });
    expect(JSON.stringify(toAuthUser(user))).not.toContain("provider_token");
  });

  it("안전하지 않거나 과도한 프로필 값은 버린다", () => {
    const user = makeUser({
      user_metadata: {
        name: "x".repeat(201),
        picture: "http://images.example.com/avatar.png",
      },
    });

    expect(toAuthUser(user)).toMatchObject({
      email: null,
      displayName: null,
      avatarUrl: null,
    });
  });
});
