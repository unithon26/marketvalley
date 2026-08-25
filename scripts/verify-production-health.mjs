const [productionUrlText, expectedVersion = ""] = process.argv.slice(2);

if (!productionUrlText) {
  throw new Error("PRODUCTION_URL is required");
}

const productionUrl = new URL(productionUrlText);
if (productionUrl.protocol !== "https:") {
  throw new Error("Production health checks require an HTTPS URL");
}
if (productionUrl.username || productionUrl.password || productionUrl.search || productionUrl.hash) {
  throw new Error("PRODUCTION_URL must not contain credentials, a query, or a fragment");
}
if (productionUrl.pathname !== "/" && productionUrl.pathname !== "") {
  throw new Error("PRODUCTION_URL must be an origin without a path");
}
if (expectedVersion && !/^[0-9a-f]{40}$/u.test(expectedVersion)) {
  throw new Error("Expected production version must be a full Git SHA");
}

const healthUrl = new URL("/api/health", productionUrl);
let lastError = new Error("Production health check did not run");

for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json();

    if (!response.ok || body.status !== "ok" || body.service !== "marketvalley") {
      throw new Error(`Production health returned ${response.status}`);
    }
    if (body.origin !== productionUrl.origin) {
      throw new Error(`Production origin mismatch: expected ${productionUrl.origin}, received ${body.origin}`);
    }
    if (!/^[0-9a-f]{40}$/u.test(body.version)) {
      throw new Error("Production health did not return a deployable Git version");
    }
    if (expectedVersion && body.version !== expectedVersion) {
      throw new Error(`Production version mismatch: expected ${expectedVersion}, received ${body.version}`);
    }

    console.log(`Production health verified at ${healthUrl.origin} (${body.version}).`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    if (attempt < 12) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

throw lastError;
