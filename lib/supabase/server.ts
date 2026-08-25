import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  getAuthCookieOptions,
  getSupabaseConfig,
  supabasePkceAuthOptions,
} from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    auth: supabasePkceAuthOptions,
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // sessions before rendering; Route Handlers can write them here.
        }
      },
    },
  });
}
