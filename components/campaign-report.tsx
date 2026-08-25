"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { ArrowRightIcon, CheckIcon, DownloadIcon } from "@/components/icons";
import { CarouselCard, carouselCoverAssets, carouselFileNames } from "@/components/renderers/carousel-card";
import type { CampaignResponse } from "@/lib/contracts/api";
import { emptyCampaignAnalytics, type CampaignAnalytics } from "@/lib/contracts/analytics";
import type { CampaignSpec, NextAction } from "@/lib/contracts/campaign";
import type { MetaDraftClientResponse } from "@/lib/contracts/metaDraft";
import type { ReservationRecord, ReservationSummary } from "@/lib/contracts/repository";
import { createMetaDraftFormData } from "@/lib/client/metaDraft";
import {
  calculateRate,
  classifyMarketFit,
  type MarketFit,
} from "@/lib/demo/reportMetrics";

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(4, local.length - visible.length))}@${domain}`;
}

const fitCopy: Record<MarketFit, string> = {
  pending: "[집계 중]",
  unsuitable: "[부적합]",
  suitable: "[적합]",
  "very-suitable": "[매우 적합]",
};

function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "집계 전" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

function MetricCards({ metrics }: { metrics: CampaignAnalytics }) {
  const ctr = calculateRate(metrics.linkClicks, metrics.impressions);
  const reservationRate = calculateRate(metrics.reservations, metrics.landingVisits);
  return (
    <section className="report-metric-cards report-animated-section" aria-label="핵심 광고 지표">
      <article className="report-impression-card">
        <strong>{formatMetric(metrics.impressions, "회")}</strong>
        <span>노출 수</span>
        <svg viewBox="0 0 384 230" aria-hidden="true">
          <path d="M48 229 C84 229 124 140 156 140 C184 140 212 159 240 159 C270 159 276 61 309 61 C335 61 359 54 384 54 L384 230 L48 230 Z" />
          <path d="M48 229 C84 229 124 140 156 140 C184 140 212 159 240 159 C270 159 276 61 309 61 C335 61 359 54 384 54" />
          <circle cx="156" cy="140" r="4" />
          <circle cx="240" cy="159" r="4" />
          <circle cx="309" cy="61" r="4" />
        </svg>
      </article>
      <article>
        <strong>{formatMetric(ctr, "%")}</strong>
        <span>Meta 링크 CTR</span>
        <p>{metrics.updatedAt ? `마지막 동기화 ${new Date(metrics.updatedAt).toLocaleString("ko-KR")}` : "Meta Insights 집계 전"}</p>
      </article>
      <article>
        <strong>{formatMetric(reservationRate, "%")}</strong>
        <span>예약률</span>
        <p>실제 고유 방문 대비 예약</p>
      </article>
    </section>
  );
}

function FunnelAnalysis({ metrics }: { metrics: CampaignAnalytics }) {
  const steps = [
    ["노출", formatMetric(metrics.impressions)],
    ["링크 클릭", formatMetric(metrics.linkClicks)],
    ["고유 랜딩 방문", formatMetric(metrics.landingVisits)],
    ["예약", formatMetric(metrics.reservations)],
  ] as const;
  const conversionRates = [
    calculateRate(metrics.linkClicks, metrics.impressions),
    calculateRate(metrics.landingVisits, metrics.linkClicks),
    calculateRate(metrics.reservations, metrics.landingVisits),
  ];

  return (
    <section className="figma-report-card funnel-card report-animated-section">
      <h2>퍼널 분석</h2>
      <div className="funnel-grid">
        {steps.map(([label, value], index) => (
          <div className="funnel-step" key={label}>
            <div className="funnel-value"><span>{label}</span><strong>{value}</strong></div>
            <div className="funnel-bar"><i /></div>
            {index < steps.length - 1 ? <span className="funnel-arrow">{formatMetric(conversionRates[index], "%")}<b>→</b></span> : null}
          </div>
        ))}
      </div>
      <p className="report-insight">모든 값은 실제 Meta Insights, 고유 방문, 예약 기록에서만 계산됩니다.</p>
    </section>
  );
}

function MeasurementCoverage({ metrics }: { metrics: CampaignAnalytics }) {
  return (
    <section className="figma-report-card demographic-card report-animated-section">
      <h2>계측 상태</h2>
      <div className="demographic-layout">
        <div>
          <h3>Meta 광고</h3>
          <p>{metrics.status === "not_connected" ? "광고 연결 전" : metrics.status === "collecting" ? "광고 심사·집계 중" : metrics.status === "final" ? "최종 집계" : "예비 집계"}</p>
        </div>
        <div>
          <h3>수집하지 않는 값</h3>
          <p>성별·연령·지역·체류시간은 실제 breakdown 계측이 없어 표시하지 않습니다.</p>
        </div>
      </div>
    </section>
  );
}

function ReservationList({ records, onDownload }: { records: readonly ReservationRecord[]; onDownload: () => void }) {
  return (
    <section className="report-reservations report-animated-section">
      <div className="report-section-title">
        <h2>예약자 리스트</h2>
        <button type="button" onClick={onDownload}><DownloadIcon size={18} />다운로드</button>
      </div>
      <div className="reservation-table-wrap">
        <table className="reservation-table">
          <thead><tr><th>No</th><th>이름</th><th>이메일</th></tr></thead>
          <tbody>
            {records.length ? records.map((record, index) => (
              <tr key={record.id}><td>{index + 1}</td><td>{record.name}</td><td>{maskEmail(record.email)}</td></tr>
            )) : <tr><td colSpan={3}>아직 예약이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type CampaignReportProps = {
  campaignId: string;
  publicSlug: string;
  initialSpec: CampaignSpec;
  initialSummary: ReservationSummary;
  initialAnalytics?: CampaignAnalytics;
  initialNextAction: NextAction | null;
  metaAdsEnabled: boolean;
};

type MetaDraftUiState = {
  kind: "idle" | "creating" | "completed" | "busy" | "quota" | "reconciliation" | "error";
  message: string;
  adsManagerUrl?: string;
  campaignId?: string;
};

type MetaRunUi = {
  run: {
    status: "PAUSED" | "ACTIVATING" | "ACTIVE" | "PAUSING" | "FAILED";
    adAccountId: string;
    lifetimeBudgetMinor: number;
    startsAt: string;
    endsAt: string;
    metaCampaignId: string;
    lastError: string | null;
  };
  activationEnabled: boolean;
  readiness: { accountStatus: number; currency: string };
  objectStatuses: {
    campaign: { effectiveStatus: string };
    adSet: { effectiveStatus: string };
    ad: { effectiveStatus: string };
  };
};

export function CampaignReport({
  campaignId,
  publicSlug,
  initialSpec,
  initialSummary,
  initialAnalytics = emptyCampaignAnalytics,
  metaAdsEnabled,
}: CampaignReportProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [metrics, setMetrics] = useState(initialAnalytics);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const reportRootRef = useRef<HTMLElement | null>(null);
  const [metaDraftState, setMetaDraftState] = useState<MetaDraftUiState>({
    kind: "idle",
    message: "",
  });
  const [metaRun, setMetaRun] = useState<MetaRunUi | null>(null);
  const [metaRunBusy, setMetaRunBusy] = useState(false);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardPreviewRef = useRef<HTMLDivElement | null>(null);
  const refreshInFlightRef = useRef(false);
  const spec = initialSpec;
  const publicPath = `/p/${encodeURIComponent(publicSlug)}`;
  const fit = classifyMarketFit(metrics);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await fetch(`/api/campaigns?id=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("report_request_failed");
      const body = await response.json() as CampaignResponse;
      setSummary(body.summary);
      setMetrics(body.analytics);
      setLoadError("");
    } catch {
      setLoadError("최신 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [campaignId]);

  const refreshMetaRun = useCallback(async () => {
    if (!metaAdsEnabled) return;
    const response = await fetch(`/api/meta/runs?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
    if (response.status === 404) return;
    if (!response.ok) throw new Error("meta_run_request_failed");
    setMetaRun(await response.json() as MetaRunUi);
  }, [campaignId, metaAdsEnabled]);

  useEffect(() => {
    const refreshReport = () => { void refresh(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshReport();
    };
    const frame = window.requestAnimationFrame(refreshReport);
    const interval = window.setInterval(refreshReport, 2_000);
    window.addEventListener("focus", refreshReport);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshReport);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!metaAdsEnabled) return;
    const frame = window.requestAnimationFrame(() => {
      void refreshMetaRun().catch(() => undefined);
    });
    const interval = window.setInterval(() => {
      void refreshMetaRun().then(refresh).catch(() => undefined);
    }, 60_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [metaAdsEnabled, refresh, refreshMetaRun]);

  useEffect(() => {
    const sections = reportRootRef.current?.querySelectorAll<HTMLElement>(".report-animated-section");
    if (!sections?.length) return;
    if (!("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8%" });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  async function renderCards() {
    await document.fonts.ready;
    const coverAsset = carouselCoverAssets[spec.templates.carouselCover];
    if (coverAsset) {
      await new Promise<void>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("carousel_cover_asset_failed"));
        image.src = coverAsset;
      });
    }
    return Promise.all(cardRefs.current.map(async (node, index) => {
      if (!node) throw new Error(`${index + 1}번 카드 렌더러가 없습니다.`);
      return toPng(node, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: false });
    }));
  }

  async function downloadCards() {
    setExporting(true);
    setNotice("");
    try {
      const images = await renderCards();
      const zip = new JSZip();
      images.forEach((dataUrl, index) => zip.file(carouselFileNames[index], dataUrl.split(",")[1], { base64: true }));
      triggerDownload(await zip.generateAsync({ type: "blob" }), `${campaignId}-carousel.zip`);
      setNotice("카드뉴스 저장을 완료했어요.");
    } catch {
      setNotice("카드뉴스 저장에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setExporting(false);
    }
  }

  function downloadReservations() {
    const rows = ["No,이름,이메일", ...summary.recent.map((record, index) => (
      `${index + 1},${record.name},${record.email}`
    ))];
    triggerDownload(new Blob([`\uFEFF${rows.join("\n")}`], { type: "text/csv;charset=utf-8" }), `${campaignId}-reservations.csv`);
    setNotice("예약자 리스트 다운로드를 완료했어요.");
  }

  async function shareReport() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("리포트 링크를 복사했어요.");
    } catch {
      setNotice("리포트 링크를 복사하지 못했어요.");
    }
  }

  function moveCardPreview(direction: -1 | 1) {
    const scroller = cardPreviewRef.current;
    const slide = scroller?.querySelector<HTMLElement>(".creative-carousel-slide");
    if (!scroller || !slide) return;
    const gap = Number.parseFloat(window.getComputedStyle(scroller).columnGap) || 0;
    scroller.scrollBy({ left: direction * (slide.offsetWidth + gap), behavior: "smooth" });
  }

  async function createMetaPausedDraft() {
    if (!metaAdsEnabled || metaDraftState.kind === "creating") return;
    setExporting(true);
    setMetaDraftState({ kind: "creating", message: "PNG 5장을 만들고 PAUSED 초안을 요청하고 있어요." });
    try {
      const images = await renderCards();
      const response = await fetch("/api/meta/drafts", {
        method: "POST",
        body: createMetaDraftFormData(campaignId, images),
      });
      const body = await response.json() as MetaDraftClientResponse;
      if (response.ok && "state" in body && body.state === "completed") {
        setMetaDraftState({
          kind: "completed",
          message: "Meta 계정의 Ads Manager에 PAUSED 초안을 만들었어요. 실제 노출·광고비 지출은 없습니다.",
          adsManagerUrl: body.adsManagerUrl,
          campaignId: body.campaignId,
        });
        await refreshMetaRun();
        return;
      }
      if ("state" in body && body.state === "reconciliation_required") {
        setMetaDraftState({
          kind: "reconciliation",
          message: "자동 재시도를 중단했어요. 운영자가 Ads Manager와 작업 기록을 확인해야 합니다.",
        });
        return;
      }
      const code = "error" in body ? body.error.code : "meta_draft_failed";
      if (code === "meta_operation_busy") {
        setMetaDraftState({ kind: "busy", message: "다른 PAUSED 초안 요청이 진행 중이에요. 잠시 후 직접 다시 확인해주세요." });
      } else if (code === "meta_quota_exceeded") {
        setMetaDraftState({ kind: "quota", message: "오늘의 PAUSED 초안 생성 한도에 도달했어요." });
      } else if (code === "meta_disabled") {
        setMetaDraftState({ kind: "error", message: "Meta 초안 기능이 현재 비활성화되어 있어요." });
      } else {
        setMetaDraftState({ kind: "error", message: "PAUSED 초안을 만들지 못했어요. 자동 재시도하지 않았습니다." });
      }
    } catch {
      setMetaDraftState({ kind: "error", message: "PAUSED 초안을 만들지 못했어요. 자동 재시도하지 않았습니다." });
    } finally {
      setExporting(false);
    }
  }

  async function controlMetaRun(action: "activate" | "pause") {
    if (!metaRun || metaRunBusy) return;
    const amount = metaRun.run.lifetimeBudgetMinor.toLocaleString("ko-KR");
    const question = action === "activate"
      ? `광고계정 ${metaRun.run.adAccountId}에서 총 예산 ₩${amount} 광고를 실제로 활성화할까요?`
      : `광고계정 ${metaRun.run.adAccountId}의 광고를 즉시 중지할까요?`;
    if (!window.confirm(question)) return;
    setMetaRunBusy(true);
    try {
      const response = await fetch("/api/meta/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          action,
          confirmAdAccountId: metaRun.run.adAccountId,
          confirmLifetimeBudgetMinor: metaRun.run.lifetimeBudgetMinor,
        }),
      });
      if (!response.ok) throw new Error("meta_control_failed");
      setNotice(action === "activate" ? "실제 광고 활성화를 요청했습니다." : "광고를 PAUSED로 중지했습니다.");
      await refreshMetaRun();
      await refresh();
    } catch {
      setNotice(action === "activate" ? "광고 활성화에 실패해 자동으로 중지를 시도했습니다." : "광고 중지 확인에 실패했습니다.");
    } finally {
      setMetaRunBusy(false);
    }
  }

  function syncActiveCard() {
    const scroller = cardPreviewRef.current;
    const slide = scroller?.querySelector<HTMLElement>(".creative-carousel-slide");
    if (!scroller || !slide) return;
    const gap = Number.parseFloat(window.getComputedStyle(scroller).columnGap) || 0;
    const step = slide.offsetWidth + gap;
    setActiveCardIndex(Math.min(4, Math.max(0, Math.round(scroller.scrollLeft / step))));
  }

  return (
    <main ref={reportRootRef} className="figma-report-page" data-market-fit={fit}>
      <div className="figma-report-container">
        <header className="report-result-heading">
          <span className="report-result-check"><CheckIcon size={20} /></span>
          <p>검증 결과</p>
          <h1>{fitCopy[fit]}</h1>
        </header>

        <div className="report-divider" />
        <MetricCards metrics={metrics} />
        <FunnelAnalysis metrics={metrics} />
        <MeasurementCoverage metrics={metrics} />

        <section className="report-creative-grid report-animated-section">
          <article className="figma-report-card creative-card">
            <h2>광고 카드뉴스 소재</h2>
            <div className="creative-carousel-shell">
              <button
                className="creative-carousel-button creative-carousel-previous"
                type="button"
                aria-label="이전 카드뉴스"
                disabled={activeCardIndex === 0}
                onClick={() => moveCardPreview(-1)}
              >
                <ArrowRightIcon size={18} />
              </button>
              <div
                ref={cardPreviewRef}
                className="creative-carousel-scroll"
                role="region"
                aria-label="AI가 생성한 광고 카드뉴스 소재"
                tabIndex={0}
                onScroll={syncActiveCard}
              >
                {[0, 1, 2, 3, 4].map((index) => (
                  <div className="creative-carousel-slide" key={index} aria-label={`${index + 1}번째 카드뉴스`}>
                    <div className="creative-carousel-scale">
                      <CarouselCard spec={spec} index={index} preview />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="creative-carousel-button creative-carousel-next"
                type="button"
                aria-label="다음 카드뉴스"
                disabled={activeCardIndex === 4}
                onClick={() => moveCardPreview(1)}
              >
                <ArrowRightIcon size={18} />
              </button>
              <div className="creative-carousel-pagination" aria-label={`${activeCardIndex + 1}번째 카드뉴스 표시 중`}>
                {[0, 1, 2, 3, 4].map((index) => <i className={index === activeCardIndex ? "active" : ""} key={index} />)}
              </div>
            </div>
            <button
              className="report-outline-button"
              type="button"
              onClick={downloadCards}
              disabled={exporting}
            >
              {exporting ? "저장 중..." : "카드뉴스 저장"}
            </button>
            <span className="sr-only">
              Meta 게시 준비 다운로드. {" "}
              {metaAdsEnabled
                ? "Meta 계정에 PAUSED 초안 생성 · 실제 노출·광고비 지출 없음"
                : "실제 게시 또는 집행 아님"}
            </span>
            {metaAdsEnabled ? (
              <>
                <button
                  className="report-outline-button meta-draft-button"
                  type="button"
                  onClick={createMetaPausedDraft}
                  disabled={exporting || ["completed", "quota", "reconciliation"].includes(metaDraftState.kind)}
                  aria-busy={metaDraftState.kind === "creating"}
                  title="Meta 계정의 Ads Manager에 PAUSED 초안 생성 · 실제 노출·광고비 지출 없음"
                >
                  Ads Manager PAUSED 초안 만들기
                </button>
                {metaDraftState.message ? (
                  <div className={`meta-draft-status meta-draft-status-${metaDraftState.kind}`}>
                    <p role={metaDraftState.kind === "completed" ? "status" : "alert"}>
                      {metaDraftState.message}
                    </p>
                    {metaDraftState.kind === "completed" && metaDraftState.adsManagerUrl ? (
                      <a href={metaDraftState.adsManagerUrl} target="_blank" rel="noreferrer">
                        Ads Manager에서 확인 (캠페인 ID {metaDraftState.campaignId})
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {metaRun ? (
                  <div className="meta-draft-status meta-draft-status-completed" aria-live="polite">
                    <p>
                      계정 {metaRun.run.adAccountId} · 총 예산 ₩{metaRun.run.lifetimeBudgetMinor.toLocaleString("ko-KR")} · 상태 {metaRun.run.status}
                    </p>
                    <p>
                      {new Date(metaRun.run.startsAt).toLocaleString("ko-KR")} ~ {new Date(metaRun.run.endsAt).toLocaleString("ko-KR")}
                    </p>
                    <p>
                      캠페인 {metaRun.objectStatuses.campaign.effectiveStatus} · 광고 세트 {metaRun.objectStatuses.adSet.effectiveStatus} · 광고 {metaRun.objectStatuses.ad.effectiveStatus}
                    </p>
                    {metaRun.run.lastError ? <p role="alert">최근 오류: {metaRun.run.lastError}</p> : null}
                    {metaRun.run.status === "ACTIVE" || metaRun.run.status === "ACTIVATING" ? (
                      <button className="report-outline-button" type="button" disabled={metaRunBusy} onClick={() => controlMetaRun("pause")}>
                        {metaRunBusy ? "처리 중..." : "광고 즉시 중지"}
                      </button>
                    ) : (
                      <button className="report-outline-button" type="button" disabled={metaRunBusy || !metaRun.activationEnabled} onClick={() => controlMetaRun("activate")}>
                        {metaRunBusy ? "처리 중..." : metaRun.activationEnabled ? "실제 광고 활성화" : "서버 활성화 잠금"}
                      </button>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </article>
          <article className="figma-report-card landing-preview-card">
            <h2>랜딩페이지</h2>
            <div className="landing-live-preview">
              <iframe src={publicPath} title="AI가 생성한 랜딩페이지 미리보기" loading="lazy" />
            </div>
            <Link className="report-outline-button" href={publicPath} target="_blank">서비스 바로가기</Link>
          </article>
        </section>

        <ReservationList records={summary.recent} onDownload={downloadReservations} />

        <div className="report-bottom-actions">
          <CampaignEntryLink className="button button-primary">다른 아이템 가설 검증하기</CampaignEntryLink>
          <button className="button button-secondary" type="button" onClick={shareReport}>리포트 공유하기</button>
        </div>
      </div>

      {loadError ? <div className="toast toast-error" role="alert">{loadError}</div> : null}
      {!loadError && notice ? <div className="toast" role="status">{notice}</div> : null}

      <div className="export-stage" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <CarouselCard key={index} spec={spec} index={index} exportRef={(node) => { cardRefs.current[index] = node; }} />
        ))}
      </div>
    </main>
  );
}
