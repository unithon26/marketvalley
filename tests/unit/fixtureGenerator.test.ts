import { describe, expect, it } from "vitest";

import { FixtureCampaignGenerator, selectReferenceCampaignTemplate } from "@/lib/demo/fixtureGenerator";

const longEnough = "발표용 입력 검증을 통과하기 위한 스무 글자 이상의 설명입니다.";

describe("FixtureCampaignGenerator", () => {
  it.each([
    ["마감 뒤 남은 메뉴와 폐기를 줄이려는 카페 사장님입니다.", "cover-31", "intro-1"],
    ["예약 취소로 생긴 동네 공방 빈자리를 알리고 싶습니다.", "cover-32", "intro-6"],
    ["독립 강사가 매번 반복 문의에 답하느라 수업 준비를 못합니다.", "cover-34", "intro-7"],
  ])("키워드에 맞는 reference template과 디자인을 선택한다", async (background, carouselCover, landingIntro) => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({ background: `${background} ${longEnough}`, solution: longEnough });

    expect(spec.project.name).toBe("새 광고 초안");
    expect(spec.templates).toEqual({ carouselCover, landingIntro });
  });

  it("키워드가 없으면 발표 기본 template을 사용한다", () => {
    const template = selectReferenceCampaignTemplate({ background: longEnough, solution: longEnough });

    expect(template.id).toBe("closing-discount");
  });

  it("호출마다 fixture 복사본을 반환한다", async () => {
    const generator = new FixtureCampaignGenerator();
    const first = await generator.generate({ background: longEnough, solution: longEnough });
    first.project.name = "변경된 이름";
    const second = await generator.generate({ background: longEnough, solution: longEnough });

    expect(second.project.name).toBe("새 광고 초안");
  });

  it("입력에 적은 상품명과 핵심 특징을 보존하되 실제 예약 폼과 충돌하는 개인정보 표현은 정규화한다", async () => {
    const generator = new FixtureCampaignGenerator();
    const background = "일회용 용기를 줄이고 싶지만 가까운 리필 매장과 가능한 품목을 매번 따로 찾아야 합니다.";
    const solution = "서비스 이름은 ‘리필루프’입니다. 핵심 특징은 용기 정보 한 번 입력, 가까운 리필 스테이션 안내, 개인정보 없는 재사용 의향 수집입니다. 하나의 공개 광고로 연결합니다.";
    const spec = await generator.generate({ background, solution });

    expect(spec.project.name).toBe("리필루프");
    expect(spec.project.oneLiner).toContain("리필루프");
    expect(spec.validation.problem).toBe(background);
    expect(spec.validation.solution).toBe(solution);
    expect(spec.landing.benefits.map((benefit) => benefit.title)).toEqual([
      "용기 정보 한 번 입력",
      "가까운 리필 스테이션 안내",
      "동의 기반 예약자명단",
    ]);
    expect(spec.messaging.hooks[0]).toContain("리필루프");
    expect(spec.messaging.caption).toContain("가까운 리필 스테이션 안내");
    expect(spec.carousel.solutionBody).toContain("동의 기반 예약자명단");
  });

  it.each([
    [
      "상품명은 공방온이고 핵심 기능은 빈자리 한 번 입력, 이웃 대상 공개 안내, 익명 참여 의향 수집입니다.",
      ["빈자리 한 번 입력", "이웃 대상 공개 안내", "동의 기반 예약자명단"],
    ],
    [
      "서비스명: 공방온. 특징을\n- 빈자리 한 번 입력\n- 이웃 대상 공개 안내\n- 익명 참여 의향 수집",
      ["빈자리 한 번 입력", "이웃 대상 공개 안내", "동의 기반 예약자명단"],
    ],
  ])("상품명과 특징을 자연스러운 여러 입력 형식에서 추출한다", async (solution, expectedFeatures) => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({
      background: "예약 취소가 생길 때마다 동네 공방 빈자리를 여러 채널에 다시 안내하는 일이 반복됩니다.",
      solution,
    });

    expect(spec.project.name).toBe("공방온");
    expect(spec.landing.benefits.map((benefit) => benefit.title)).toEqual(expectedFeatures);
  });

  it("익명의 명과 일반 문장의 이름·기능을 상품 정보 표식으로 오인하지 않는다", async () => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({
      background: "가족끼리 필요한 물건을 매번 메신저로 물어보고 중복 구매를 확인하는 일이 반복됩니다.",
      solution: "이름 없이 하나의 공개 목록을 가족과 공유하고 익명 사용 의향을 모으며 필요한 기능과 정보를 제공합니다.",
    });

    expect(spec.project.name).toBe("새 광고 초안");
    expect(spec.project.name).not.toContain("사용 의향");
    expect(spec.landing.benefits.map((benefit) => benefit.title)).toEqual([
      "동의 기반 예약자명단",
      "사전예약 의향 한곳에 수집",
      "문제·솔루션 한 번 입력",
    ]);
  });

  it("한 개의 reference 키워드가 다른 업종의 의미 콘텐츠를 누출하지 않는다", async () => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({
      background: "온라인 쇼핑몰 운영자가 할인 정책과 쿠폰 조건을 채널마다 다시 확인하고 안내하는 일이 반복됩니다.",
      solution: "상품명은 검수봇입니다. 핵심 특징은 정책 한 번 입력, 조건 충돌 확인, 익명 사용 의향 수집입니다.",
    });
    const serialized = JSON.stringify(spec);

    expect(spec.project.name).toBe("검수봇");
    expect(spec.validation.customer).toBe("입력한 문제를 반복해서 겪는 초기 고객");
    expect(serialized).not.toMatch(/카페|남은 메뉴|마감 메뉴|커피빛|사장님/u);
    expect(spec.messaging.hashtags).toContain("#검수봇");
    expect(spec.carousel.visualPrompts.join(" ")).toContain("검수봇");
  });

  it("CampaignSpec 한도인 80자 상품명을 그대로 보존한다", async () => {
    const generator = new FixtureCampaignGenerator();
    const productName = "가".repeat(80);
    const spec = await generator.generate({
      background: "새로운 업무 관리 상품을 준비하며 여러 채널의 안내 자료를 매번 다시 만드는 일이 반복됩니다.",
      solution: `서비스 이름은 ‘${productName}’입니다. 핵심 특징은 업무 한 번 입력, 공개 안내 구성, 익명 사용 의향 수집입니다.`,
    });

    expect(spec.project.name).toBe(productName);
  });

  it("이름과 기능 선언문을 한 줄 설명으로 다시 사용하지 않는다", async () => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({
      background: "고객 안내 내용을 채널마다 다시 정리하고 같은 질문에 반복해서 답하는 일이 계속됩니다.",
      solution: "서비스명: 안내온. 핵심 기능은 정보 한 번 입력, 공개 안내 자동 구성, 익명 사용 의향 수집입니다. 고객에게 필요한 안내를 하나의 광고로 자동 구성합니다.",
    });

    expect(spec.project.name).toBe("안내온");
    expect(spec.project.oneLiner).toBe("안내온: 고객에게 필요한 안내를 하나의 광고로 자동 구성합니다");
    expect(spec.project.oneLiner).not.toContain("핵심 기능은");
  });

  it("서로 다른 입력을 같은 완성 fixture로 반환하지 않는다", async () => {
    const generator = new FixtureCampaignGenerator();
    const first = await generator.generate({
      background: "예약 취소 때마다 공방의 남은 자리를 여러 채널에 다시 올려야 해서 수업 준비가 늦어집니다.",
      solution: "서비스 이름은 ‘공방온’입니다. 핵심 특징은 빈자리 한 번 입력, 이웃 대상 공개 안내, 익명 참여 의향 수집입니다.",
    });
    const second = await generator.generate({
      background: "독립 강사가 수업 일정과 준비물 문의에 같은 답을 반복하느라 정작 수업 준비가 자주 끊깁니다.",
      solution: "서비스 이름은 ‘클래스콕’입니다. 핵심 특징은 수업 정보 한 번 입력, 문의 안내 자동 구성, 익명 수강 의향 수집입니다.",
    });

    expect(first.project.name).toBe("공방온");
    expect(second.project.name).toBe("클래스콕");
    expect(first).not.toEqual(second);
  });
});
