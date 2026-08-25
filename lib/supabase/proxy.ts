import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  getAuthCookieOptions,
  getOptionalSupabaseConfig,
  supabasePkceAuthOptions,
} from "@/lib/supabase/config";

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let config;
  try {
    config = getOptionalSupabaseConfig();
  } catch {
    // Auth endpoints report configuration errors. Public fixture routes must
    // remain usable while live environment variables are being connected.
    return NextResponse.next({ request });
  }
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    auth: supabasePkceAuthOptions,
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headersToSet)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // getClaims verifies the JWT and refreshes an expired session when possible.
  // Authorization checks still belong in each protected data operation.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Protected operations verify identity again. An Auth outage must not
    // turn public pages or the fixture demo into a global application outage.
  }
  return response;
}
