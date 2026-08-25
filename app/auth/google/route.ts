import { handleGoogleSignIn } from "@/lib/auth/handlers";
import { createAuthContinuationStore } from "@/lib/auth/continuation";
import { resolveAuthMode } from "@/lib/auth/mode";
import { beginPresentationGoogleSignIn } from "@/lib/auth/presentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (resolveAuthMode() === "mock") return beginPresentationGoogleSignIn(request);
  return handleGoogleSignIn(request, {
    createClient: createSupabaseServerClient,
    continuations: await createAuthContinuationStore(),
  });
}
