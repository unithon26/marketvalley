import { describe, expect, it } from "vitest";

import {
  DraftConflictError,
  DraftOwnershipError,
  DuplicateSignalError,
} from "@/lib/contracts/repository";
import { demoCampaign, demoCampaignId, seedReservations, workshopVacancyCampaign } from "@/lib/demo/demo-campaign";
import { FixtureCampaignRepository } from "@/lib/demo/fixtureRepository";

describe("FixtureCampaignRepository", () => {
  it("발표 seed 예약을 결정적으로 집계한다", async () => {
    const repository = new FixtureCampaignRepository({ seedDemoCampaign: true, seedReservations });

    await expect(repository.getReservationSummary(demoCampaignId)).resolves.toMatchObject({
      total: 4,
    });
  });

  it("같은 draft와 spec 게시를 멱등 처리하고 다른 spec은 거절한다", async () => {
    const repository = new FixtureCampaignRepository({ now: () => new Date("2026-08-24T00:00:00.000Z") });
    const first = await repository.publish("draft-1", demoCampaign);
    const repeated = await repository.publish("draft-1", demoCampaign);

    expect(repeated).toEqual(first);
    await expect(repository.publish("draft-1", workshopVacancyCampaign)).rejects.toBeInstanceOf(DraftConflictError);
  });

  it("이메일별 한 번만 예약을 기록하고 대소문자·공백을 정규화한다", async () => {
    const repository = new FixtureCampaignRepository({ seedDemoCampaign: true, seedReservations: [] });

    await expect(repository.recordReservation({
      campaignId: demoCampaignId,
      name: "홍길동",
      email: "visitor-one@example.com",
      consent: true,
    })).resolves.toBeUndefined();
    await expect(repository.getReservationSummary(demoCampaignId)).resolves.toMatchObject({ total: 1 });

    await expect(repository.recordReservation({
      campaignId: demoCampaignId,
      name: "홍길동",
      email: "  Visitor-One@example.com  ",
      consent: true,
    })).rejects.toBeInstanceOf(DuplicateSignalError);
  });

  it("캠페인 소유 draft만 다음 행동을 저장하고 삭제할 수 있다", async () => {
    const repository = new FixtureCampaignRepository({ seedDemoCampaign: true });

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
    const repository = new FixtureCampaignRepository({ seedReservations });
    const published = await repository.publish("new-draft", workshopVacancyCampaign);
    await repository.recordReservation({
      campaignId: published.id,
      name: "방문자",
      email: "visitor-one@example.com",
      consent: true,
    });
    await repository.saveNextAction({ campaignId: published.id, draftId: "new-draft", nextAction: "revise" });

    expect(published).toMatchObject({ id: "fixture-1", slug: "campaign-1" });
    await expect(repository.getBySlug(published.slug)).resolves.toMatchObject({ id: published.id });
    await expect(repository.getBySlug(published.id)).resolves.toBeNull();
    await expect(repository.saveNextAction({ campaignId: published.id, draftId: published.id, nextAction: "continue" }))
      .rejects.toBeInstanceOf(DraftOwnershipError);
    const reset = await repository.reset({ campaignId: published.id, draftId: "new-draft" });
    expect(reset.nextAction).toBeNull();
    await expect(repository.getReservationSummary(published.id)).resolves.toMatchObject({ total: 4 });
  });
});
