import { handleSession } from "@/lib/auth/handlers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleSession({ createClient: createSupabaseServerClient });
}
