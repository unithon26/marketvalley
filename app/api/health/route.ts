import { resolveCampaignGeneratorStatus } from "@/lib/ai/generatorConfig";
import { resolveGenerationQuotaConfig } from "@/lib/ai/generationRateLimit";
import { resolveCampaignRepositoryMode } from "@/lib/demo/repositoryConfig";
import { resolveReservationProtectionConfig } from "@/lib/security/reservationProtection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Environment = Record<string, string | undefined>;

function safeVersion(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && /^[a-zA-Z0-9._-]{1,64}$/u.test(normalized)
    ? normalized
    : "unknown";
}

function safeOrigin(value: string | undefined): string {
  try {
    const url = new URL(value ?? "");
    const localHttp = url.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.pathname === "/"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (url.protocol === "https:" || localHttp)
      ? url.origin
      : "unknown";
  } catch {
    return "unknown";
  }
}

export function createHealthResponse(environment: Environment = process.env): Response {
  try {
    const generator = resolveCampaignGeneratorStatus(environment);
    const repositoryMode = resolveCampaignRepositoryMode(environment);
    const reservationProtection = resolveReservationProtectionConfig(repositoryMode, environment);
    const quota = resolveGenerationQuotaConfig(environment);
    const ready = generator.ready;

    return Response.json(
      {
        status: ready ? "ok" : "not_ready",
        service: "marketvalley",
        version: safeVersion(environment.APP_VERSION),
        origin: safeOrigin(environment.NEXT_PUBLIC_SITE_URL),
        checks: {
          generator: { mode: generator.mode, ready: generator.ready },
          repository: { mode: repositoryMode, ready: true },
          quota: { mode: quota.mode, ready: true },
          reservations: { mode: reservationProtection.mode, ready: true },
        },
      },
      {
        status: ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        status: "not_ready",
        service: "marketvalley",
        version: safeVersion(environment.APP_VERSION),
        origin: safeOrigin(environment.NEXT_PUBLIC_SITE_URL),
        checks: {
          generator: { ready: false },
          repository: { ready: false },
          quota: { ready: false },
          reservations: { ready: false },
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function GET(): Promise<Response> {
  return createHealthResponse();
}
