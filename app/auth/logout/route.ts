import { handleLogout } from "@/lib/auth/handlers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleLogout(request, { createClient: createSupabaseServerClient });
}
