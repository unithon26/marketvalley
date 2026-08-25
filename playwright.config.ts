import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `corepack pnpm build && corepack pnpm exec next start --port ${port}`,
    env: {
      CAMPAIGN_GENERATOR_MODE: "fixture",
      CAMPAIGN_REPOSITORY_MODE: "fixture",
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
