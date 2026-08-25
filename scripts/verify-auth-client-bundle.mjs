import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "next", "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_bundle_test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  },
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status ?? 1);

const homeHtml = readFileSync(".next/server/app/index.html", "utf8");

if (!homeHtml.includes("로그인 상태 확인 중") || homeHtml.includes("로그인 준비 중")) {
  throw new Error("Next.js client bundle이 설정된 인증 GNB 초기 상태를 렌더링하지 않았습니다.");
}

console.log("Configured auth client bundle smoke passed");
