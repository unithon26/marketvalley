import { describe, expect, it } from "vitest";

import {
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
} from "@/lib/contracts/repository";
import { demoCampaign, demoCampaignId, workshopVacancyCampaign } from "@/lib/demo/demo-campaign";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";

describe("FixtureCampaignRepository", () => {
  it("발표 seed 응답을 결정적으로 집계한다", async () => {
    const repository = new FixtureCampaignRepository();

    await expect(repository.getSignalSummary(demoCampaignId)).resolves.toMatchObject({
      positive: 2,
      neutral: 1,
      negative: 1,
      total: 4,
      decisionStatus: "insufficient_sample",
    });
  });

  it("같은 draft와 spec 게시를 멱등 처리하고 다른 spec은 거절한다", async () => {
    const repository = new FixtureCampaignRepository({ now: () => new Date("2026-08-24T00:00:00.000Z") });
    const first = await repository.publish("draft-1", demoCampaign);
    const repeated = await repository.publish("draft-1", demoCampaign);

    expect(repeated).toEqual(first);
    await expect(repository.publish("draft-1", workshopVacancyCampaign)).rejects.toBeInstanceOf(DraftConflictError);
  });

  it("visitor별 한 번만 응답을 기록하고 실제 선택지 외 값은 거절한다", async () => {
    const repository = new FixtureCampaignRepository({ seedResponses: [] });

    await expect(repository.recordSignal({ campaignId: demoCampaignId, visitorId: "visitor-one", optionId: "positive" }))
      .resolves.toMatchObject({ total: 1, positive: 1 });
    await expect(repository.recordSignal({ campaignId: demoCampaignId, visitorId: "visitor-one", optionId: "neutral" }))
      .rejects.toBeInstanceOf(DuplicateSignalError);
    await expect(repository.recordSignal({
      campaignId: demoCampaignId,
      visitorId: "visitor-two",
      optionId: "unsupported" as "positive",
    })).rejects.toThrow();
  });

  it("캠페인 소유 draft만 다음 행동을 저장하고 삭제할 수 있다", async () => {
    const repository = new FixtureCampaignRepository();

    await expect(repository.saveNextAction({ campaignId: demoCampaignId, draftId: "wrong-draft", nextAction: "continue" }))
      .rejects.toBeInstanceOf(DraftOwnershipError);
    await expect(repository.saveNextAction({ campaignId: demoCampaignId, draftId: demoCampaignId, nextAction: "continue" }))
      .resolves.toBe("continue");
    expect((await repository.getById(demoCampaignId))?.nextAction).toBe("continue");

    await expect(repository.delete({ campaignId: demoCampaignId, draftId: "wrong-draft" }))
      .rejects.toBeInstanceOf(DraftOwnershipError);
    await repository.delete({ campaignId: demoCampaignId, draftId: demoCampaignId });
    await expect(repository.getById(demoCampaignId)).resolves.toBeNull();
  });

  it("새 게시를 고유 id와 slug로 격리하고 소유 draft로 상태를 초기화한다", async () => {
    const repository = new FixtureCampaignRepository();
    const published = await repository.publish("new-draft", workshopVacancyCampaign);
    await repository.recordSignal({ campaignId: published.id, visitorId: "visitor-one", optionId: "positive" });
    await repository.saveNextAction({ campaignId: published.id, draftId: "new-draft", nextAction: "revise" });

    expect(published).toMatchObject({ id: "fixture-1", slug: "workshop-vacancy-1" });
    await expect(repository.saveNextAction({ campaignId: published.id, draftId: published.id, nextAction: "continue" }))
      .rejects.toBeInstanceOf(DraftOwnershipError);
    const reset = await repository.reset({ campaignId: published.id, draftId: "new-draft" });
    expect(reset.nextAction).toBeNull();
    await expect(repository.getSignalSummary(published.id)).resolves.toMatchObject({ total: 4, positive: 2 });
  });
});
