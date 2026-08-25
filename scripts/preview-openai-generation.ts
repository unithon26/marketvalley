import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { OpenAICampaignGenerator } from "@/lib/ai/openaiCampaignGenerator";
import { demoIdeaInput } from "@/lib/demo/demo-campaign";
import type { IdeaInput } from "@/lib/contracts/generator";

const background = process.argv[2] ?? demoIdeaInput.background;
const solution = process.argv[3] ?? demoIdeaInput.solution;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY가 .env.local에 없습니다. 먼저 채워주세요.");
  process.exit(1);
}

const generator = new OpenAICampaignGenerator({
  apiKey,
  model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
});

const input: IdeaInput = { background, solution };

console.log("=== 입력 ===");
console.log(input);
console.log("\nOpenAI 호출 중...\n");

const started = Date.now();
const spec = await generator.generate(input);
const elapsedMs = Date.now() - started;

console.log(`완료 (${elapsedMs}ms)\n`);
console.log("=== 핵심 결과 ===");
console.log("상품명:", spec.project.name);
console.log("한 줄 설명:", spec.project.oneLiner);
console.log("가치 제안:", spec.messaging.valueProposition);
console.log("후킹 문구:", spec.messaging.hooks);
console.log("게시 문구:", spec.messaging.caption);
console.log("해시태그:", spec.messaging.hashtags);
console.log("\n랜딩 문제:", spec.landing.painPoints);
console.log("\n랜딩 특징:", spec.landing.benefits);
console.log("\n예약 폼 안내 문구(question):", spec.validation.signal.question);
console.log("\n확인 필요 주장:", spec.safety.claimsToReview);
console.log("\n=== 전체 CampaignSpec (JSON) ===");
console.log(JSON.stringify(spec, null, 2));
