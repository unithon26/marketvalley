import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import {
  ideaInputSchema,
  type CampaignGenerator,
  type IdeaInput,
} from "@/lib/contracts/generator";
import {
  referenceCampaignTemplates,
  type ReferenceCampaignTemplate,
} from "@/lib/demo/demo-campaign";

type TemplateMatch = {
  template: ReferenceCampaignTemplate;
  score: number;
};

type DerivedFeature = {
  title: string;
  body: string;
};

const featurePatterns: ReadonlyArray<{
  pattern: RegExp;
  title: string;
  body: string;
}> = [
  {
    pattern: /한\s*번\s*입력|한번\s*입력|입력하면/,
    title: "한 번 입력으로 시작",
    body: "핵심 정보를 한 번 입력하면 광고에 필요한 문구와 화면을 함께 구성합니다.",
  },
  {
    pattern: /랜딩|소개\s*페이지|공개\s*(?:페이지|안내)|상세\s*페이지/,
    title: "공개 페이지 자동 구성",
    body: "입력한 상품 정보와 특징을 고객이 바로 이해할 수 있는 공개 페이지에 반영합니다.",
  },
  {
    pattern: /카드뉴스|캐러셀|게시용?\s*카드|게시\s*(?:자료|이미지|콘텐츠)|인스타/,
    title: "게시 카드 동시 생성",
    body: "공개 페이지와 같은 상품명과 특징으로 게시용 카드뉴스를 함께 만듭니다.",
  },
  {
    pattern: /개인정보|익명/,
    title: "동의 기반 예약자명단",
    body: "이름과 이메일은 동의를 받은 뒤 예약자명단 확인 목적으로만 저장합니다.",
  },
  {
    pattern: /구매\s*의향|수강\s*의향|참여\s*의향|사용\s*의향|관심\s*(?:응답|신호)/,
    title: "사전예약 의향 한곳에 수집",
    body: "흩어진 문의 대신 동의 후 접수된 예약 의향을 한곳에서 확인하고 다음 행동을 판단합니다.",
  },
  {
    pattern: /알림|안내/,
    title: "안내 문구 자동 정리",
    body: "입력한 내용을 채널마다 다시 쓰지 않도록 하나의 안내 메시지로 정리합니다.",
  },
];

const genericFeatureFallbacks: readonly DerivedFeature[] = [
  {
    title: "문제·솔루션 한 번 입력",
    body: "검증하려는 문제와 제안을 한 번 적으면 모든 광고 문구의 기준으로 사용합니다.",
  },
  {
    title: "랜딩·카드뉴스 동시 구성",
    body: "상품명과 특징을 같은 내용의 공개 페이지와 게시 카드뉴스에 함께 반영합니다.",
  },
  {
    title: "동의 기반 예약자명단",
    body: "이름과 이메일을 동의 후 받아 초기 예약 의향을 한곳에서 확인합니다.",
  },
];

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function limit(text: string, maximum: number): string {
  const normalized = compact(text);
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

function stripSentenceEnding(text: string): string {
  return compact(text)
    .replace(/^[‘’“”"']+|[‘’“”"']+$/g, "")
    .replace(/(?:입니다|이에요|예요|이다|이고요|이고|이며)$/u, "")
    .replace(/[.!?。]+$/u, "")
    .trim();
}

function extractProductName(input: IdeaInput, fallback: string): string {
  const source = `${input.solution}. ${input.background}`;
  const patterns = [
    /(?:(?:제품|서비스|프로젝트|앱|상품)\s*(?:이름|명)\s*(?:은|는|이|가|:)?|이름\s*(?:은|는|이|가|:))\s*[‘“"']([^’”"'\n]{2,80})[’”"']/iu,
    /(?:(?:제품|서비스|프로젝트|앱|상품)\s*(?:이름|명)\s*(?:은|는|이|가|:)?|이름\s*(?:은|는|이|가|:))\s*([가-힣A-Za-z0-9][가-힣A-Za-z0-9 _-]{1,79}?)(?=\s*(?:입니다|이에요|예요|이다|이고요|이고|이며|[,.;!?]|(?:핵심\s*)?(?:특징|기능)|$))/iu,
    /[‘“"']([^’”"'\n]{2,30})[’”"'](?:이라는?|라는)\s*(?:서비스|제품|앱|도구|플랫폼)/iu,
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9_-]{1,29})(?:이라는?|라는)\s*(?:서비스|제품|앱|도구|플랫폼)/iu,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const candidate = stripSentenceEnding(match[1]);
    if (candidate.length >= 2) return limit(candidate, 80);
  }

  return fallback;
}

function declaredFeatureTitles(solution: string): string[] {
  const match = solution.match(/(?:핵심\s*)?(?:특징|기능)(?:\s*키워드)?\s*(?:은|는|이|가|:|을|를)\s*/u);
  if (!match) return [];

  const declaration = solution
    .slice((match.index ?? 0) + match[0].length)
    .split(/[.!?。]/u, 1)[0];

  return declaration
    .split(/\s*(?:,|·|\/|\n| 그리고 | 및 )\s*/u)
    .map(stripSentenceEnding)
    .map((item) => item.replace(/^(?:(?:각각|바로)\s*|[-*•·]\s*|\d+[.)]\s*)/u, ""))
    .filter((item) => item.length >= 2)
    .map((item) => (
      /(?:개인정보\s*(?:없|미수집)|익명|연락처\s*(?:없|미수집))/u.test(item)
        ? "동의 기반 예약자명단"
        : item
    ))
    .map((item) => limit(item, 28));
}

function featureBody(title: string, productName: string): string {
  return limit(`${productName}은 ‘${title}’ 특징을 랜딩페이지와 카드뉴스에 같은 내용으로 반영합니다.`, 90);
}

function deriveFeatures(input: IdeaInput, productName: string): [DerivedFeature, DerivedFeature, DerivedFeature] {
  const derived: DerivedFeature[] = [];
  const push = (feature: DerivedFeature) => {
    if (!derived.some((item) => item.title === feature.title)) derived.push(feature);
  };

  for (const title of declaredFeatureTitles(input.solution)) {
    push({ title, body: featureBody(title, productName) });
  }

  const source = `${input.background} ${input.solution}`;
  for (const feature of featurePatterns) {
    if (feature.pattern.test(source)) push({ title: feature.title, body: feature.body });
  }

  for (const benefit of genericFeatureFallbacks) {
    push({ title: benefit.title, body: benefit.body });
  }

  return derived.slice(0, 3) as [DerivedFeature, DerivedFeature, DerivedFeature];
}

function toHashtag(text: string): string {
  const token = text.replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 28);
  return `#${token || "시장검증"}`;
}

function deriveOneLiner(solution: string, productName: string, features: readonly DerivedFeature[]): string {
  const descriptiveSentence = compact(solution)
    .split(/[.!?。]\s*/u)
    .map(stripSentenceEnding)
    .find((sentence) => sentence.length >= 10
      && !/(?:(?:제품|서비스|프로젝트|앱|상품)\s*(?:이름|명)|이름)\s*(?:은|는|이|가|:)/u.test(sentence)
      && !/(?:핵심\s*)?(?:특징|기능)(?:\s*키워드)?\s*(?:은|는|이|가|:|을|를)/u.test(sentence));

  if (descriptiveSentence) return limit(`${productName}: ${descriptiveSentence}`, 120);
  return limit(`${productName}: ${features.map((feature) => feature.title).join(" · ")}`, 120);
}

function applyNeutralSemanticScaffold(spec: CampaignSpec, problem: string): void {
  spec.project.category = "초기 아이디어 시장검증";
  spec.validation.customer = "입력한 문제를 반복해서 겪는 초기 고객";
  spec.validation.invalidationEvidence = "사전예약 안내 뒤에도 예약이 충분히 모이지 않으면 현재 문제와 제안 메시지를 다시 검토한다.";
  spec.landing.painPoints = [
    { title: "문제를 다시 설명합니다", body: limit(problem, 90) },
    { title: "채널마다 다시 만듭니다", body: "같은 아이디어를 랜딩과 게시 카드에 맞춰 반복해서 쓰고 조판해야 합니다." },
    { title: "반응을 따로 모읍니다", body: "각 채널의 관심 표현을 다시 모아 다음 판단을 준비해야 합니다." },
  ];
  spec.landing.steps = [
    { title: "배경과 솔루션을 적습니다", body: "검증하려는 문제와 상품명, 핵심 특징을 한 번 입력합니다." },
    { title: "광고를 구성합니다", body: "같은 정보로 공개 랜딩과 카드뉴스, 게시 문구를 만듭니다." },
    { title: "예약자명단을 확인합니다", body: "동의 후 접수된 이름과 이메일을 보고 사람이 다음 행동을 판단합니다." },
  ];
  spec.landing.faq = [
    { question: "어떤 정보를 받나요?", answer: "이름과 이메일을 명시적 동의 후 예약자명단 확인 목적으로만 저장합니다." },
    { question: "예약하면 구매가 확정되나요?", answer: "아니요. 사전예약은 초기 의향을 남기는 절차이며 구매나 성과를 보장하지 않습니다." },
    { question: "광고가 자동으로 게시되나요?", answer: "아니요. 게시 자료만 준비하며 공개와 운영 판단은 사람이 합니다." },
  ];
  spec.carousel.problem.headline = "반복되는 일을 확인합니다";
  spec.safety.prohibitedClaimsRemoved = [
    "구매, 매출이나 제품 효과가 보장된다는 확인되지 않은 표현을 사용하지 않았습니다.",
  ];
}

function applyGenericPresentationFallback(spec: CampaignSpec): void {
  spec.brand = {
    tone: "bold",
    primaryColor: "#191F28",
    accentColor: "#6B36E8",
    visualDirection: "Figma 표지 31의 흰 바탕, 검은 타이포와 보라색 강조를 사용합니다.",
  };
  spec.templates = { carouselCover: "cover-31", landingIntro: "intro-1" };
}

function templateVisualDirection(template: CampaignSpec["templates"]["carouselCover"]): string {
  if (template === "cover-32") {
    return "Figma 표지 32의 흑백 사진 위에 흰색 타이포와 보라색 강조를 사용합니다.";
  }
  if (template === "cover-34") {
    return "Figma 표지 34의 사진 위에 흰색 타이포와 보라색 강조를 사용합니다.";
  }
  return "Figma 표지 31의 흰 바탕, 검은 타이포와 보라색 강조를 사용합니다.";
}

function keywordScore(text: string, template: ReferenceCampaignTemplate): number {
  return template.keywords.reduce(
    (score, keyword) => score + (text.includes(keyword.toLocaleLowerCase("ko-KR")) ? keyword.length : 0),
    0,
  );
}

function matchReferenceCampaignTemplate(input: IdeaInput): TemplateMatch {
  const parsedInput = ideaInputSchema.parse(input);
  const text = `${parsedInput.background} ${parsedInput.solution}`.toLocaleLowerCase("ko-KR");

  let template = referenceCampaignTemplates[0];
  let score = 0;

  for (const candidate of referenceCampaignTemplates) {
    const candidateScore = keywordScore(text, candidate);
    if (candidateScore > score) {
      template = candidate;
      score = candidateScore;
    }
  }

  return { template, score };
}

export function selectReferenceCampaignTemplate(input: IdeaInput): ReferenceCampaignTemplate {
  return matchReferenceCampaignTemplate(input).template;
}

function personalizeCampaign(input: IdeaInput, match: TemplateMatch): CampaignSpec {
  const spec = structuredClone(match.template.spec);
  const productName = extractProductName(input, "새 광고 초안");
  const features = deriveFeatures(input, productName);
  const problem = limit(input.background, 240);
  const solution = limit(input.solution, 240);
  const oneLiner = deriveOneLiner(input.solution, productName, features);
  const featureSummary = features.map((feature) => feature.title).join(" · ");
  const projectHashtag = toHashtag(productName);
  const featureHashtags = features.map((feature) => toHashtag(feature.title));

  applyNeutralSemanticScaffold(spec, problem);
  if (match.score === 0) applyGenericPresentationFallback(spec);
  spec.brand.visualDirection = templateVisualDirection(spec.templates.carouselCover);

  spec.generation.promptVersion = `demo-personalizer-v1-${match.template.id}`;
  spec.project.name = productName;
  spec.project.oneLiner = oneLiner;
  spec.validation.problem = problem;
  spec.validation.solution = solution;
  spec.validation.expectedSignal = limit(`${spec.validation.customer}이 정보 수집에 동의하고 ${productName} 사전예약을 제출한다.`, 240);
  spec.validation.assumptions = [
    limit(`입력한 배경의 반복 문제가 ${spec.validation.customer}에게 실제로 존재한다.`, 240),
    limit(`${featureSummary} 특징이 초기 고객의 관심을 끌 수 있다.`, 240),
  ];
  spec.validation.signal.ctaLabel = "사전예약하기";
  spec.validation.signal.question = limit(`${productName} 예약자명단에 이름과 이메일을 남길까요?`, 180);
  spec.validation.signal.successMessage = limit(`예약이 접수됐어요. 다음 안내는 ${productName} 운영자가 직접 전달합니다.`, 160);

  spec.messaging.valueProposition = limit(`${features[0].title}, ${productName}으로 한 번에`, 40);
  spec.messaging.hooks = [
    limit(`${productName}, 고객이 정말 원할까요?`, 70),
    limit(`${features[0].title}부터 ${features[1].title}까지`, 70),
    limit(`${features[2].title}, 다음 판단만 남기세요`, 70),
  ];
  spec.messaging.caption = limit(`${problem} ${productName}은 ${solution} 핵심 특징은 ${featureSummary}입니다. 이름과 이메일은 동의 후 예약자명단 확인 목적으로만 저장합니다.`, 1_200);
  spec.messaging.hashtags = Array.from(new Set([
    projectHashtag,
    ...featureHashtags,
    "#시장검증",
    "#랜딩페이지",
    "#카드뉴스",
  ])).slice(0, 12);

  spec.landing.seoTitle = limit(`${productName} | ${spec.messaging.hooks[0]}`, 100);
  spec.landing.hero.eyebrow = limit(`${spec.project.category} · ${features[0].title}`, 60);
  spec.landing.hero.supportingText = limit(solution, 180);
  spec.landing.painPoints[0] = {
    ...spec.landing.painPoints[0],
    body: limit(problem, 90),
  };
  spec.landing.benefits = features;

  spec.carousel.hookBody = limit(`${featureSummary}. 입력한 아이디어를 같은 메시지의 랜딩과 카드뉴스로 자동 구성합니다.`, 180);
  spec.carousel.problem.body = limit(problem, 90);
  spec.carousel.insight = {
    headline: limit(features[0].title, 28),
    body: limit(`${features[1].title}과 ${features[2].title}을 같은 입력에서 함께 준비합니다.`, 90),
  };
  spec.carousel.solutionBody = limit(`${productName}의 핵심 특징 ${featureSummary}을 공개 랜딩과 게시 카드에 일관되게 반영합니다.`, 180);
  spec.carousel.ctaBody = limit(`${productName}이 제안하는 방식에 관심이 있다면 동의 후 이름과 이메일을 남겨 사전예약에 참여해주세요.`, 180);
  spec.carousel.visualPrompts = [
    limit(`${productName}과 ${features[0].title}을 중심으로 한 ${spec.templates.carouselCover} 표지 조판, 추가 문구 없음`, 300),
    limit(`입력한 반복 문제를 상징하는 단순한 장면, ${spec.brand.visualDirection} 추가 문구 없음`, 300),
    limit(`${features[0].title}과 ${features[1].title}을 하나의 흐름으로 연결한 장면, 추가 문구 없음`, 300),
    limit(`${productName}의 ${features[2].title}을 보여주는 단순한 장면, 추가 문구 없음`, 300),
    limit(`동의 기반 예약자명단을 확인하고 사람이 다음 행동을 판단하는 장면, 추가 문구 없음`, 300),
  ];
  spec.safety.claimsToReview = [
    limit(`${productName}의 효과와 실제 구매·수강·참여 전환은 추가 검증이 필요합니다.`, 240),
  ];

  return campaignSpecSchema.parse(spec);
}

export class FixtureCampaignGenerator implements CampaignGenerator {
  async generate(input: IdeaInput): Promise<CampaignSpec> {
    const parsedInput = ideaInputSchema.parse(input);
    return personalizeCampaign(parsedInput, matchReferenceCampaignTemplate(parsedInput));
  }
}

export const fixtureCampaignGenerator = new FixtureCampaignGenerator();
export const campaignGenerator: CampaignGenerator = fixtureCampaignGenerator;
