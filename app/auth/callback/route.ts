import { handleAuthCallback } from "@/lib/auth/handlers";
import { createAuthContinuationStore } from "@/lib/auth/continuation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleAuthCallback(request, {
    createClient: createSupabaseServerClient,
    continuations: await createAuthContinuationStore(),
  });
}
