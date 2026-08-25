import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "next", "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CAMPAIGN_GENERATOR_MODE: "fixture",
    CAMPAIGN_REPOSITORY_MODE: "fixture",
    ANTHROPIC_API_KEY: "bundle-test-anthropic-secret",
    SUPABASE_SECRET_KEY: "bundle-test-supabase-secret",
    SUPABASE_SERVICE_ROLE_KEY: "bundle-test-supabase-legacy-service-role",
    SIGNAL_HASH_SECRET: "bundle-test-hmac-secret-32-bytes-minimum",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_bundle_test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  },
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status ?? 1);

const homeHtml = readFileSync(".next/server/app/index.html", "utf8");

if (
  !homeHtml.includes("로그인 상태 확인 중")
  || homeHtml.includes("로그인 준비 중")
) {
  throw new Error("Next.js client bundle이 설정된 인증 GNB 초기 상태를 렌더링하지 않았습니다.");
}

const clientChunkText = readdirSync(".next/static/chunks", { recursive: true })
  .filter((path) => typeof path === "string" && path.endsWith(".js"))
  .map((path) => readFileSync(`.next/static/chunks/${path}`, "utf8"))
  .join("\n");

if (
  clientChunkText.includes("bundle-test-anthropic-secret")
  || clientChunkText.includes("ANTHROPIC_API_KEY")
  || clientChunkText.includes("bundle-test-supabase-secret")
  || clientChunkText.includes("bundle-test-supabase-legacy-service-role")
  || clientChunkText.includes("bundle-test-hmac-secret-32-bytes-minimum")
) {
  throw new Error("서버 전용 Anthropic 또는 Supabase 설정이 client bundle에 포함됐습니다.");
}

console.log("Configured auth and server-secret client bundle smoke passed");
