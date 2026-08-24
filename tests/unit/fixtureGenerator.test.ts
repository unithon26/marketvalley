import { describe, expect, it } from "vitest";

import { FixtureCampaignGenerator, selectReferenceCampaignTemplate } from "@/lib/demo/fixtureGenerator";

const longEnough = "발표용 입력 검증을 통과하기 위한 스무 글자 이상의 설명입니다.";

describe("FixtureCampaignGenerator", () => {
  it.each([
    ["마감 뒤 남은 메뉴와 폐기를 줄이려는 카페 사장님입니다.", "마감한입"],
    ["예약 취소로 생긴 동네 공방 빈자리를 알리고 싶습니다.", "동네공방 빈자리"],
    ["독립 강사가 매번 반복 문의에 답하느라 수업 준비를 못합니다.", "클래스 문의형"],
  ])("키워드에 맞는 reference template을 선택한다", async (background, projectName) => {
    const generator = new FixtureCampaignGenerator();
    const spec = await generator.generate({ background: `${background} ${longEnough}`, solution: longEnough });

    expect(spec.project.name).toBe(projectName);
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

    expect(second.project.name).toBe("마감한입");
  });
});
