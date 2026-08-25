import {
  campaignSpecSchema,
  type CampaignSpec,
  type NextAction,
} from "@/lib/contracts/campaign";
import type { IdeaInput } from "@/lib/contracts/generator";
import { summarizeReservations } from "@/lib/demo/campaignReservations";
import type { ReservationRecord, ReservationSummary } from "@/lib/contracts/repository";

export const demoCampaignId = "demo";
export const demoCampaignSlug = "demo";

function defineCampaign(spec: CampaignSpec): CampaignSpec {
  return campaignSpecSchema.parse(spec);
}

export const demoCampaign = defineCampaign({
  schemaVersion: "2",
  generation: {
    promptVersion: "demo-fixture-v2-closing-discount",
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
  templates: {
    carouselCover: "cover-31",
    landingIntro: "intro-1",
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
      { question: "개인정보를 받나요?", answer: "네. 이름과 이메일을 동의 후에만 예약자명단에 저장합니다." },
      { question: "오늘 바로 판매가 보장되나요?", answer: "아니요. 응답은 당일 구매 의향을 확인하는 신호일 뿐 판매를 보장하지 않습니다." },
      { question: "게시가 자동으로 올라가나요?", answer: "아니요. 게시 자료를 준비하며 실제 게시와 운영 판단은 사장님이 합니다." },
    ],
  },
  carousel: {
    hookBody: "오늘 남은 메뉴, 마감 전에 이웃에게 한 번에 알려보세요.",
    problem: {
      headline: "마감 때마다 알림 일이 쌓입니다",
      body: "남은 메뉴를 적고 게시 이미지를 만드는 사이 마감 시간은 가까워집니다.",
    },
    insight: {
      headline: "메뉴 입력은 한 번이면 됩니다",
      body: "같은 메뉴 정보로 공개 페이지와 게시 자료를 함께 준비하세요.",
    },
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

export const workshopVacancyCampaign = defineCampaign({
  schemaVersion: "2",
  generation: {
    promptVersion: "demo-fixture-v2-workshop-vacancy",
    model: "deterministic-demo-fixture",
    generatedAt: "2026-08-24T09:00:00.000Z",
  },
  project: {
    name: "동네공방 빈자리",
    oneLiner: "예약 취소로 생긴 공방 빈자리를 이웃에게 알리는 도구",
    category: "동네 공방 예약 취소 자리 알림",
    language: "ko",
  },
  validation: {
    customer: "예약 취소로 당일 빈자리가 생기는 동네 원데이 공방 운영자",
    problem: "갑자기 빈자리가 생길 때마다 수업 정보와 안내 이미지를 다시 만들어 여러 채널에 올려야 한다.",
    solution: "취소 자리 정보를 한 번 입력하면 공개 안내, 캐러셀과 익명 참여 의향 질문을 함께 만든다.",
    expectedSignal: "동네 공방 운영자가 취소 자리 알림 방식에 사용 의향을 선택한다.",
    invalidationEvidence: "응답 5개가 모여도 긍정 응답이 3개 미만이면 취소 자리 알림 문제와 메시지를 다시 검토한다.",
    assumptions: [
      "동네 공방 운영자는 갑작스러운 취소 자리를 알리는 반복 제작 업무를 부담으로 느낀다.",
      "개인정보 없는 선택형 질문으로 운영자의 초기 사용 의향을 확인할 수 있다.",
    ],
    signal: {
      type: "solution_interest",
      ctaLabel: "빈자리 알림 사용 의향 답하기",
      question: "공방 취소 자리를 한 번 입력해 이웃에게 알리는 방식, 써볼 의향이 있나요?",
      options: [
        { id: "positive", label: "네, 써보고 싶어요" },
        { id: "neutral", label: "조금 더 알아볼게요" },
        { id: "negative", label: "지금은 필요하지 않아요" },
      ],
      successMessage: "응답이 기록됐어요. 다음 판단은 공방 운영자가 직접 선택합니다.",
    },
    decisionRule: {
      minimumResponses: 5,
      minimumPositiveResponses: 3,
      description: "응답 5개 중 긍정 3개 이상이면 다음 검증을 이어갑니다.",
    },
  },
  brand: {
    tone: "warm",
    primaryColor: "#5A3E36",
    accentColor: "#D58C5B",
    visualDirection: "따뜻한 흙빛과 아이보리 바탕에 손으로 만든 질감, 작은 공예 도구와 둥근 예약 카드를 사용합니다.",
  },
  templates: {
    carouselCover: "cover-32",
    landingIntro: "intro-6",
  },
  messaging: {
    valueProposition: "갑자기 생긴 공방 빈자리, 한 번에 알리세요.",
    hooks: [
      "오늘 생긴 공방 빈자리, 이웃에게 바로",
      "취소 자리 알림을 매번 다시 만들지 마세요",
      "수업 준비는 남기고 빈자리 알림은 줄이세요",
    ],
    caption: "예약 취소로 빈자리가 생겼을 때 수업 정보와 시간을 한 번 입력해 이웃에게 알릴 준비를 해보세요. 공개 안내와 게시 자료, 익명 참여 의향 신호가 같은 흐름에서 만들어집니다.",
    hashtags: ["#동네공방", "#원데이클래스", "#공방빈자리", "#취소자리", "#오늘의수업"],
  },
  landing: {
    seoTitle: "동네공방 빈자리 | 취소 자리를 이웃에게 알리세요",
    hero: {
      eyebrow: "동네 원데이 공방을 위한 취소 자리 알림",
      supportingText: "오늘 생긴 빈자리 정보를 한 번 입력하면 이웃에게 보여줄 공개 페이지와 게시 자료를 함께 준비합니다.",
    },
    painPoints: [
      { title: "취소 때마다 다시 씁니다", body: "수업 시간과 남은 자리를 매번 새로 정리해 여러 채널에 알려야 합니다." },
      { title: "안내 이미지를 다시 만듭니다", body: "기존 게시물을 고치고 크기를 맞추는 동안 수업 준비가 늦어집니다." },
      { title: "관심 답변을 따로 모읍니다", body: "참여할 사람이 있는지 메시지와 댓글을 오가며 확인해야 합니다." },
    ],
    benefits: [
      { title: "한 번의 빈자리 입력", body: "수업과 남은 자리 정보를 입력하면 알림 내용을 한 번에 구성합니다." },
      { title: "같은 수업 안내", body: "공개 랜딩과 캐러셀이 같은 수업 정보에서 바로 만들어집니다." },
      { title: "익명 참여 의향", body: "선택형 응답을 보고 다음 알림을 이어갈지 직접 판단합니다." },
    ],
    steps: [
      { title: "빈자리 정보를 입력합니다", body: "수업 종류, 시간과 남은 자리를 짧게 적습니다." },
      { title: "알림을 준비합니다", body: "공개 페이지와 게시 자료를 같은 정보로 만듭니다." },
      { title: "의향을 보고 판단합니다", body: "익명 응답을 확인하고 다음 행동을 직접 선택합니다." },
    ],
    faq: [
      { question: "예약 정보를 받나요?", answer: "네. 이름과 이메일을 동의 후에만 예약자명단에 저장합니다." },
      { question: "빈자리가 채워진다고 보장하나요?", answer: "아니요. 응답은 참여 의향을 확인하는 신호일 뿐 예약을 보장하지 않습니다." },
      { question: "게시가 자동으로 올라가나요?", answer: "아니요. 게시 자료를 준비하며 실제 게시와 운영 판단은 공방 운영자가 합니다." },
    ],
  },
  carousel: {
    hookBody: "오늘 생긴 공방 빈자리, 수업 전에 이웃에게 한 번에 알려보세요.",
    problem: {
      headline: "취소 때마다 알림 일이 생깁니다",
      body: "수업 정보를 다시 쓰고 이미지를 고치는 사이 준비 시간이 줄어듭니다.",
    },
    insight: {
      headline: "빈자리 입력은 한 번이면 됩니다",
      body: "같은 수업 정보로 공개 페이지와 게시 자료를 함께 준비하세요.",
    },
    solutionBody: "동네공방 빈자리는 취소 자리 정보를 공개 랜딩, 캐러셀, 익명 참여 의향 질문으로 연결합니다.",
    ctaBody: "공방 취소 자리 알림 방식, 써볼 의향이 있나요?",
    visualPrompts: [
      "warm ivory background, one empty pottery workshop seat and clay tools, earthy brown and terracotta, no text",
      "small workshop owner updating several cancellation notices before class, warm editorial illustration, no text",
      "one workshop schedule card branching into a public page and social carousel, handcrafted minimal illustration, no text",
      "neighbor discovering an open workshop seat on a phone, earthy warm palette, no text",
      "workshop owner reviewing three anonymous interest dots before class, calm editorial style, no text",
    ],
  },
  safety: {
    claimsToReview: ["취소 자리 알림이 실제 예약으로 이어지는지는 추가 검증이 필요합니다."],
    prohibitedClaimsRemoved: [
      "빈자리가 반드시 채워진다는 표현을 사용하지 않았습니다.",
      "예약률이나 매출이 증가한다는 확인되지 않은 효과를 사용하지 않았습니다.",
    ],
  },
});

export const classInquiryCampaign = defineCampaign({
  schemaVersion: "2",
  generation: {
    promptVersion: "demo-fixture-v2-class-inquiry",
    model: "deterministic-demo-fixture",
    generatedAt: "2026-08-24T09:00:00.000Z",
  },
  project: {
    name: "클래스 문의형",
    oneLiner: "반복 수업 문의를 하나의 안내와 관심 신호로 연결하는 도구",
    category: "독립 강사 클래스 문의 안내",
    language: "ko",
  },
  validation: {
    customer: "반복 문의 때문에 수업 준비가 끊기는 독립 클래스 강사",
    problem: "일정, 준비물과 대상 수준을 반복해서 답하고 안내 게시물을 다시 만드는 동안 수업 준비가 끊긴다.",
    solution: "수업 정보를 한 번 입력하면 공개 안내, 캐러셀과 익명 수강 의향 질문을 함께 만든다.",
    expectedSignal: "독립 강사가 반복 문의 안내 방식에 사용 의향을 선택한다.",
    invalidationEvidence: "응답 5개가 모여도 긍정 응답이 3개 미만이면 반복 문의 문제와 안내 메시지를 다시 검토한다.",
    assumptions: [
      "독립 강사는 같은 수업 정보를 반복해서 답하는 일을 부담으로 느낀다.",
      "개인정보 없는 선택형 질문으로 안내 방식의 초기 사용 의향을 확인할 수 있다.",
    ],
    signal: {
      type: "solution_interest",
      ctaLabel: "문의 안내 사용 의향 답하기",
      question: "수업 정보를 한 번 입력해 반복 문의 안내를 준비하는 방식, 써볼 의향이 있나요?",
      options: [
        { id: "positive", label: "네, 써보고 싶어요" },
        { id: "neutral", label: "조금 더 알아볼게요" },
        { id: "negative", label: "지금은 필요하지 않아요" },
      ],
      successMessage: "응답이 기록됐어요. 다음 판단은 클래스 강사가 직접 선택합니다.",
    },
    decisionRule: {
      minimumResponses: 5,
      minimumPositiveResponses: 3,
      description: "응답 5개 중 긍정 3개 이상이면 다음 검증을 이어갑니다.",
    },
  },
  brand: {
    tone: "trust",
    primaryColor: "#263B5A",
    accentColor: "#6EA6D9",
    visualDirection: "차분한 남색과 밝은 하늘색 바탕에 정돈된 수업 카드, 체크 표시와 넉넉한 여백을 사용합니다.",
  },
  templates: {
    carouselCover: "cover-34",
    landingIntro: "intro-7",
  },
  messaging: {
    valueProposition: "반복 문의 답변은 맡기고 수업 준비에 집중하세요.",
    hooks: [
      "같은 수업 문의, 매번 다시 답하지 마세요",
      "수업 정보 한 번으로 안내를 정리하세요",
      "문의 정리는 줄이고 수업 준비를 남기세요",
    ],
    caption: "일정, 준비물과 대상 수준을 반복해서 답하고 있다면 수업 정보를 한 번 입력해 안내를 준비해보세요. 공개 안내와 게시 자료, 익명 수강 의향 신호를 같은 흐름으로 연결합니다.",
    hashtags: ["#독립강사", "#클래스운영", "#수업문의", "#원데이클래스", "#수업준비"],
  },
  landing: {
    seoTitle: "클래스 문의형 | 반복 수업 문의를 한 번에 안내하세요",
    hero: {
      eyebrow: "독립 강사를 위한 반복 수업 문의 안내",
      supportingText: "수업 정보를 한 번 입력하면 예비 수강생에게 보여줄 공개 페이지와 게시 자료를 함께 준비합니다.",
    },
    painPoints: [
      { title: "같은 질문에 다시 답합니다", body: "일정, 준비물과 대상 수준을 메시지마다 반복해서 설명합니다." },
      { title: "안내 글을 따로 만듭니다", body: "게시물과 상세 안내를 따로 고치며 수업 준비 흐름이 끊깁니다." },
      { title: "관심을 다시 정리합니다", body: "문의마다 표현이 달라 실제 수강 의향을 따로 분류해야 합니다." },
    ],
    benefits: [
      { title: "한 번의 수업 입력", body: "핵심 수업 정보를 입력하면 필요한 안내 내용을 한 번에 구성합니다." },
      { title: "같은 안내 메시지", body: "공개 랜딩과 캐러셀이 같은 수업 정보에서 바로 만들어집니다." },
      { title: "익명 수강 의향", body: "선택형 응답을 보고 다음 안내를 이어갈지 직접 판단합니다." },
    ],
    steps: [
      { title: "수업 정보를 입력합니다", body: "일정, 준비물과 대상 수준을 짧게 적습니다." },
      { title: "안내를 준비합니다", body: "공개 페이지와 게시 자료를 같은 정보로 만듭니다." },
      { title: "의향을 보고 판단합니다", body: "익명 응답을 확인하고 다음 행동을 직접 선택합니다." },
    ],
    faq: [
      { question: "연락처를 받나요?", answer: "네. 이름과 이메일을 동의 후에만 예약자명단에 저장합니다." },
      { question: "수강 신청으로 처리되나요?", answer: "아니요. 응답은 수강 의향을 확인하는 신호이며 실제 신청이 아닙니다." },
      { question: "답변이 자동 전송되나요?", answer: "아니요. 안내 자료를 준비하며 실제 소통과 수업 판단은 강사가 합니다." },
    ],
  },
  carousel: {
    hookBody: "반복되는 수업 문의, 같은 정보를 매번 다시 답하지 마세요.",
    problem: {
      headline: "반복 문의가 준비를 끊습니다",
      body: "일정과 준비물을 다시 답하는 사이 수업에 집중할 시간이 줄어듭니다.",
    },
    insight: {
      headline: "수업 입력은 한 번이면 됩니다",
      body: "같은 수업 정보로 공개 페이지와 게시 자료를 함께 준비하세요.",
    },
    solutionBody: "클래스 문의형은 수업 정보를 공개 랜딩, 캐러셀, 익명 수강 의향 질문으로 연결합니다.",
    ctaBody: "반복 수업 문의 안내 방식, 써볼 의향이 있나요?",
    visualPrompts: [
      "clean navy and sky blue background, one organized class information card, calm editorial illustration, no text",
      "independent instructor answering repeated phone questions beside class materials, minimal illustration, no text",
      "one class brief branching into a public page and social carousel, structured modern illustration, no text",
      "prospective student viewing clear class information on a phone, calm blue palette, no text",
      "instructor reviewing three anonymous interest dots before planning the next class, minimal editorial style, no text",
    ],
  },
  safety: {
    claimsToReview: ["문의 안내가 실제 수강 신청으로 이어지는지는 추가 검증이 필요합니다."],
    prohibitedClaimsRemoved: [
      "문의가 반드시 수강 신청으로 바뀐다는 표현을 사용하지 않았습니다.",
      "수강률이나 매출이 증가한다는 확인되지 않은 효과를 사용하지 않았습니다.",
    ],
  },
});

export type ReferenceCampaignTemplate = {
  id: "closing-discount" | "workshop-vacancy" | "class-inquiry";
  label: "마감할인" | "동네공방 빈자리" | "클래스 문의형";
  keywords: readonly string[];
  spec: CampaignSpec;
};

export const referenceCampaignTemplates: readonly ReferenceCampaignTemplate[] = [
  {
    id: "closing-discount",
    label: "마감할인",
    keywords: ["마감", "남은 메뉴", "카페", "폐기", "할인"],
    spec: demoCampaign,
  },
  {
    id: "workshop-vacancy",
    label: "동네공방 빈자리",
    keywords: ["동네 공방", "공방", "예약 취소", "취소 자리", "빈자리", "원데이"],
    spec: workshopVacancyCampaign,
  },
  {
    id: "class-inquiry",
    label: "클래스 문의형",
    keywords: ["반복 문의", "클래스 문의", "수업 문의", "문의 답변", "독립 강사", "수업 준비", "강사"],
    spec: classInquiryCampaign,
  },
];

/** The fixed input behind the presentation's "예시 불러오기" action. */
export const demoIdeaInput = {
  background: "동네에서 작은 카페를 운영합니다. 마감 시간이 가까워지면 멀쩡한 디저트와 샌드위치가 남지만, 이웃에게 알릴 방법이 없어 폐기하는 날이 많습니다. 매번 게시물을 새로 만드는 일도 부담입니다.",
  solution: "카페 사장님이 남은 메뉴와 마감 시간을 입력하면 공개 안내와 게시용 카드가 함께 만들어지고, 방문자는 개인정보 없이 오늘 구매 의향만 선택해 답합니다.",
  description: "마감 전 남은 메뉴를 이웃에게 알리고 싶은 동네 1인 카페를 위한 당일 메뉴 알림 도구",
  expectedCustomer: "마감 전 남은 메뉴가 생기는 동네 1인 카페 사장님",
  desiredSignal: "solution_interest" as const,
  tone: "warm" as const,
} satisfies IdeaInput & {
  description: string;
  expectedCustomer: string;
  desiredSignal: "solution_interest";
  tone: "warm";
};

/**
 * Four deterministic reservations. They are presentation fixtures, not real user data.
 */
export const seedReservations: readonly Omit<ReservationRecord, "id">[] = [
  { name: "이서준", email: "seojun.lee@example.com", reservedAt: "2026-08-24T09:00:00.000Z" },
  { name: "박하늘", email: "haneul.park@example.com", reservedAt: "2026-08-24T09:05:00.000Z" },
  { name: "최민서", email: "minseo.choi@example.com", reservedAt: "2026-08-24T09:10:00.000Z" },
  { name: "정다인", email: "dain.jung@example.com", reservedAt: "2026-08-24T09:15:00.000Z" },
];

export function evaluateDecision(records: readonly Omit<ReservationRecord, "id">[]): ReservationSummary {
  return summarizeReservations(records.map((record, index) => ({ id: `seed-${index + 1}`, ...record })));
}

export type { NextAction };
