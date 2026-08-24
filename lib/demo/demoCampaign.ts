import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";

export const demoCampaignId = "demo";
export const demoCampaignSlug = "demo";

export const demoCampaign: CampaignSpec = campaignSpecSchema.parse({
  schemaVersion: "1",
  generation: {
    promptVersion: "demo-fixture-v1",
    model: "deterministic-demo-fixture",
    generatedAt: "2026-08-24T09:00:00.000Z",
  },
  project: {
    name: "마감한입",
    oneLiner: "마감 전 남은 메뉴를 이웃에게 알리는 동네 카페 도구",
    category: "동네 카페 마감 메뉴 알림",
    language: "ko",
  },
  validation: {
    customer: "마감 전 남은 메뉴를 이웃에게 알리고 싶은 동네 1인 카페 사장님",
    problem: "마감 전 남은 메뉴가 생길 때마다 메뉴 정보와 알림 이미지를 따로 만들어 이웃에게 알려야 한다.",
    solution: "남은 메뉴를 한 번 입력하면 공개 랜딩, 캐러셀과 익명 당일 구매 의향 질문을 함께 만든다.",
    expectedSignal: "동네 1인 카페 사장님이 마감 전 남은 메뉴 알림 방식에 사용 의향을 선택한다.",
    invalidationEvidence: "응답 5개가 모여도 긍정 응답이 3개 미만이면 현재 문제와 메시지를 다시 검토한다.",
    assumptions: [
      "동네 1인 카페 사장님은 마감 전 남은 메뉴를 알리는 반복 업무를 부담으로 느낀다.",
      "개인정보를 받지 않는 선택형 질문으로 초기 사용 의향을 확인할 수 있다.",
    ],
    signal: {
      type: "solution_interest",
      ctaLabel: "마감한입 사용 의향 답하기",
      question: "마감 전 남은 메뉴를 한 번 입력해 이웃에게 알리는 방식, 써볼 의향이 있나요?",
      options: [
        { id: "positive", label: "네, 써보고 싶어요" },
        { id: "neutral", label: "조금 더 알아볼게요" },
        { id: "negative", label: "지금은 필요하지 않아요" },
      ],
      successMessage: "응답이 기록됐어요. 다음 판단은 마감한입 운영자가 직접 선택합니다.",
    },
    decisionRule: {
      minimumResponses: 5,
      minimumPositiveResponses: 3,
      description: "응답 5개 중 긍정 3개 이상이면 다음 검증을 이어갑니다.",
    },
  },
  brand: {
    tone: "warm",
    primaryColor: "#214A3D",
    accentColor: "#E5A94A",
    visualDirection: "짙은 초록과 크림색 바탕에 따뜻한 커피빛 질감, 작은 메뉴 카드와 둥근 라벨을 사용합니다.",
  },
  messaging: {
    valueProposition: "마감 전 남은 메뉴, 이웃에게 바로 알리세요.",
    hooks: [
      "마감 전 남은 메뉴, 한 번에 알리세요",
      "오늘 남은 메뉴를 이웃에게 바로",
      "알림 업무는 줄이고 메뉴에 집중하세요",
    ],
    caption: "마감 전 남은 메뉴가 생겼을 때, 메뉴를 한 번 입력해 이웃에게 알릴 준비를 해보세요. 마감한입은 공개 랜딩과 게시 자료, 익명 당일 구매 의향 신호를 한 흐름으로 만듭니다.",
    hashtags: ["#마감한입", "#동네카페", "#1인카페", "#마감메뉴", "#오늘의메뉴"],
  },
  landing: {
    seoTitle: "마감한입 | 마감 전 남은 메뉴를 이웃에게 알리세요",
    hero: {
      eyebrow: "동네 1인 카페를 위한 마감 메뉴 알림",
      supportingText: "오늘 남은 메뉴를 한 번 입력하면 이웃에게 보여줄 공개 페이지와 게시 자료를 함께 준비합니다.",
    },
    painPoints: [
      { title: "마감 때마다 다시 씁니다", body: "남은 메뉴와 안내 문구를 매번 새로 정리해 이웃에게 알려야 합니다." },
      { title: "이미지를 따로 만듭니다", body: "게시 카드와 안내 페이지를 따로 만들며 마감 시간이 가까워집니다." },
      { title: "관심을 다시 확인합니다", body: "오늘 메뉴를 원하는 사람이 있는지 알기 위해 답을 따로 모아야 합니다." },
    ],
    benefits: [
      { title: "한 번의 메뉴 입력", body: "남은 메뉴를 입력하면 오늘의 알림에 필요한 내용을 한 번에 구성합니다." },
      { title: "같은 안내 메시지", body: "공개 랜딩과 캐러셀은 같은 메뉴 정보에서 바로 만들어집니다." },
      { title: "당일 구매 의향", body: "익명 선택형 응답을 보고 다음 알림을 이어갈지 직접 판단합니다." },
    ],
    steps: [
      { title: "남은 메뉴를 입력합니다", body: "오늘 알리고 싶은 메뉴와 마감 시간을 짧게 적습니다." },
      { title: "알림을 준비합니다", body: "이웃에게 보여줄 공개 페이지와 게시 자료를 같은 정보로 만듭니다." },
      { title: "의향을 보고 판단합니다", body: "익명 응답을 확인하고 다음 알림을 이어갈지 직접 선택합니다." },
    ],
    faq: [
      { question: "개인정보를 받나요?", answer: "아니요. 이 캠페인은 선택형 관심 응답만 기록합니다." },
      { question: "오늘 바로 판매가 보장되나요?", answer: "아니요. 응답은 당일 구매 의향을 확인하는 신호일 뿐 판매를 보장하지 않습니다." },
      { question: "게시가 자동으로 올라가나요?", answer: "아니요. 게시 자료를 준비하며 실제 게시와 운영 판단은 사장님이 합니다." },
    ],
  },
  carousel: {
    hookBody: "오늘 남은 메뉴, 마감 전에 이웃에게 한 번에 알려보세요.",
    problem: { headline: "마감 때마다 알림 일이 쌓입니다", body: "남은 메뉴를 적고 게시 이미지를 만드는 사이 마감 시간은 가까워집니다." },
    insight: { headline: "메뉴 입력은 한 번이면 됩니다", body: "같은 메뉴 정보로 공개 페이지와 게시 자료를 함께 준비하세요." },
    solutionBody: "마감한입은 남은 메뉴를 공개 랜딩, 캐러셀, 익명 당일 구매 의향 질문으로 연결합니다.",
    ctaBody: "마감 전 남은 메뉴 알림, 써볼 의향이 있나요?",
    visualPrompts: [
      "warm cream background, a small cafe closing sign and one remaining pastry card, dark green and coffee brown, no text",
      "solo cafe owner at closing time with scattered menu notes and a phone, warm editorial illustration, no text",
      "one simple cafe menu card branching into a public page and social carousel, warm minimal illustration, no text",
      "neighbor viewing a cafe's remaining menu on a phone, dark green and amber palette, no text",
      "calm solo cafe owner reviewing three purchase-interest dots before closing, warm minimal editorial style, no text",
    ],
  },
  safety: {
    claimsToReview: ["마감 전 남은 메뉴 알림이 실제 당일 구매로 이어지는지는 추가 검증이 필요합니다."],
    prohibitedClaimsRemoved: [
      "남은 메뉴가 반드시 판매된다는 표현을 사용하지 않았습니다.",
      "매출 증가나 폐기 감소와 같은 확인되지 않은 효과를 사용하지 않았습니다.",
    ],
  },
});
