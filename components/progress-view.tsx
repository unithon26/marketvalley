"use client";

import { useCallback, useEffect, useState } from "react";

import { ValidationProgress, type ValidationProgressStage } from "@/components/validation-progress";
import type { CampaignLifecycleResponse } from "@/lib/contracts/api";
import type { CampaignLifecycleRecord } from "@/lib/contracts/repository";

function stage(status: CampaignLifecycleRecord["status"]): ValidationProgressStage {
  switch (status) {
    case "SUBMITTED":
      return 0;
    case "GENERATING":
    case "PREPARING":
    case "AWAITING_ACTIVATION":
    case "RETRY_WAIT":
    case "FAILED":
    case "ARCHIVED":
      return 1;
    case "COLLECTING":
    case "FINALIZING":
      return 2;
    case "COMPLETED":
      return 3;
  }
}

function koreanDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  return `${korea.getUTCMonth() + 1}월 ${korea.getUTCDate()}일 ${String(korea.getUTCHours()).padStart(2, "0")}:${String(korea.getUTCMinutes()).padStart(2, "0")}`;
}

function statusText(campaign: CampaignLifecycleRecord): string {
  switch (campaign.status) {
    case "SUBMITTED":
      return "접수 완료 · 자동 작업 대기 중";
    case "GENERATING":
      return "AI 광고 문구 생성 중";
    case "PREPARING":
      return "랜딩·카드뉴스·광고 제작 중";
    case "AWAITING_ACTIVATION":
      return "Meta 실제 게재 상태 확인 중";
    case "COLLECTING": {
      const end = koreanDateTime(campaign.collectionEndsAt);
      return end ? `${end}까지 실제 반응 수집` : "실제 광고 반응 수집 중";
    }
    case "FINALIZING":
      return "최종 Meta 데이터 반영 중";
    case "COMPLETED":
      return "최종 리포트 작성 완료";
    case "RETRY_WAIT":
      return "일시 오류 · 자동 재시도 예약";
    case "FAILED":
      return "추가 확인 필요 · 자동 집행 중단";
    case "ARCHIVED":
      return "이전 프로젝트";
  }
}

export function ProgressView({
  initialCampaign,
}: {
  initialCampaign: CampaignLifecycleResponse;
}) {
  const [campaign, setCampaign] = useState(initialCampaign);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/campaigns/lifecycle?id=${encodeURIComponent(initialCampaign.id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    setCampaign(await response.json() as CampaignLifecycleResponse);
  }, [initialCampaign.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const frame = window.requestAnimationFrame(() => { void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <ValidationProgress
      current={stage(campaign.status)}
      reportHref={`/campaigns/${encodeURIComponent(campaign.id)}`}
      statusText={statusText(campaign)}
      errorMessage={campaign.status === "FAILED" ? campaign.lastErrorMessage : null}
    />
  );
}
