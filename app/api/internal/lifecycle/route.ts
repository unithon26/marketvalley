import { timingSafeEqual } from "node:crypto";

import { jsonResponse } from "@/app/api/_lib/http";
import { processCampaignLifecycle } from "@/lib/lifecycle/campaignLifecycleProcessor";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const supplied = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return jsonResponse(
      { error: { code: "worker_unauthorized", message: "Worker authorization failed." } },
      { status: 401 },
    );
  }
  try {
    const lifecycle = await processCampaignLifecycle({ maximumSteps: 10 });
    return jsonResponse({
      ok: true,
      lifecycleProcessed: lifecycle.processed,
    });
  } catch (error) {
    console.error("campaign lifecycle worker failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse(
      { error: { code: "worker_failed", message: "Lifecycle worker failed." } },
      { status: 503 },
    );
  }
}
