import { pathToFileURL } from "node:url";

const anthropicVersion = "2023-06-01";
const defaultTimeoutMs = 10_000;

function readRequired(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readSupabaseServerKey(environment) {
  return environment.SUPABASE_SECRET_KEY?.trim()
    || environment.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || (() => { throw new Error("a Supabase server key is required"); })();
}

async function expectOk(fetchImplementation, label, url, init) {
  let response;
  try {
    response = await fetchImplementation(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(defaultTimeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "network error";
    throw new Error(`${label} connection failed (${reason})`);
  }

  if (!response.ok) {
    throw new Error(`${label} rejected the production credentials (${response.status})`);
  }

  return response;
}

async function expectOpenApiSchema(fetchImplementation, url, serverKey) {
  const response = await expectOk(fetchImplementation, "Supabase REST OpenAPI", url, {
    headers: {
      Accept: "application/openapi+json, application/json",
      apikey: serverKey,
      Authorization: `Bearer ${serverKey}`,
    },
  });

  let schema;
  try {
    schema = await response.json();
  } catch {
    throw new Error("Supabase REST OpenAPI returned an invalid schema");
  }

  const requiredPaths = [
    "/campaigns",
    "/campaign_reservations",
    "/meta_ad_runs",
    "/meta_insight_snapshots",
    "/rpc/consume_generation_quota",
    "/rpc/claim_campaign_lifecycle",
    "/rpc/renew_campaign_lifecycle_lease",
    "/rpc/transition_campaign_lifecycle",
    "/rpc/delete_owned_unstarted_campaign",
    "/rpc/record_campaign_reservation",
  ];
  for (const path of requiredPaths) {
    if (!schema || typeof schema !== "object" || !(path in (schema.paths ?? {}))) {
      throw new Error(`Supabase REST OpenAPI is missing required path ${path}`);
    }
  }
}

async function verifyTurnstileSecret(fetchImplementation, secretKey) {
  const body = new URLSearchParams({ secret: secretKey, response: "marketvalley-preflight-invalid" });
  const response = await expectOk(fetchImplementation, "Cloudflare Turnstile Siteverify", "https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Cloudflare Turnstile Siteverify returned an invalid response");
  }
  if (result?.success !== false || !Array.isArray(result?.["error-codes"]) || !result["error-codes"].includes("invalid-input-response")) {
    throw new Error("Cloudflare Turnstile Siteverify rejected the production secret");
  }
}

export async function verifyExternalDependencies({
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
  const anthropicKey = readRequired(environment, "ANTHROPIC_API_KEY");
  const anthropicModel = readRequired(environment, "ANTHROPIC_TEXT_MODEL");
  const supabaseUrl = new URL(readRequired(environment, "NEXT_PUBLIC_SUPABASE_URL"));
  const supabasePublishableKey = readRequired(environment, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const supabaseKey = readSupabaseServerKey(environment);
  readRequired(environment, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const turnstileSecretKey = readRequired(environment, "TURNSTILE_SECRET_KEY");

  if (supabaseUrl.protocol !== "https:" || supabaseUrl.pathname !== "/") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin");
  }

  const anthropicModelUrl = new URL(
    `/v1/models/${encodeURIComponent(anthropicModel)}`,
    "https://api.anthropic.com",
  );
  await expectOk(fetchImplementation, "Anthropic Models API", anthropicModelUrl, {
    headers: {
      "anthropic-version": anthropicVersion,
      "x-api-key": anthropicKey,
    },
  });

  const supabaseAuthSettingsUrl = new URL("/auth/v1/settings", supabaseUrl);
  await expectOk(fetchImplementation, "Supabase Auth API", supabaseAuthSettingsUrl, {
    headers: {
      Accept: "application/json",
      apikey: supabasePublishableKey,
    },
  });

  await expectOpenApiSchema(fetchImplementation, new URL("/rest/v1/", supabaseUrl), supabaseKey);
  await verifyTurnstileSecret(fetchImplementation, turnstileSecretKey);

  return { anthropic: "ready", supabase: "ready", turnstile: "ready" };
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  await verifyExternalDependencies();
  console.log("Anthropic, Supabase, and Turnstile production dependencies are ready.");
}
