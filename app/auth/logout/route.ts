import { handleLogout } from "@/lib/auth/handlers";
import { resolveAuthMode } from "@/lib/auth/mode";
import { endPresentationSession } from "@/lib/auth/presentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (resolveAuthMode() === "mock") return endPresentationSession(request);
  return handleLogout(request, { createClient: createSupabaseServerClient });
}
