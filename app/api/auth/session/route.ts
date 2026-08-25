import { handleSession } from "@/lib/auth/handlers";
import { resolveAuthMode } from "@/lib/auth/mode";
import { hasPresentationAuthSession, presentationSessionResponse } from "@/lib/auth/presentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (resolveAuthMode() === "mock") {
    return presentationSessionResponse(await hasPresentationAuthSession());
  }
  return handleSession({ createClient: createSupabaseServerClient });
}
