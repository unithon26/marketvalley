"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { ArrowRightIcon, CheckIcon, DownloadIcon } from "@/components/icons";
import { CarouselCard, carouselCoverAssets, carouselFileNames } from "@/components/renderers/carousel-card";
import type { CampaignResponse } from "@/lib/contracts/api";
import type { CampaignSpec } from "@/lib/contracts/campaign";
import type { ReservationRecord, ReservationSummary } from "@/lib/contracts/repository";
import {
  classifyMarketFitByCtr,
  demoMarketReportMetrics,
  type MarketFit,
  type MarketReportMetrics,
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
  unsuitable: "[부적합]",
  suitable: "[적합]",
  "very-suitable": "[매우 적합]",
};

const ageRows = ["18–24", "18–24", "18–24", "18–24"] as const;
const regionBars = [44, 96, 77, 73, 96, 62, 84, 78] as const;
const scrollRows = [
  [25, "57s"],
  [50, "43s"],
  [75, "34s"],
  [90, "43s"],
  [100, "12s"],
] as const;

function MetricCards({ metrics }: { metrics: MarketReportMetrics }) {
  return (
    <section className="report-metric-cards" aria-label="핵심 광고 지표">
      <article className="report-impression-card">
        <strong>{metrics.impressions.toLocaleString("ko-KR")}회</strong>
        <span>노출 수</span>
        <svg viewBox="0 0 190 110" aria-hidden="true">
          <path d="M0 104 C36 96 48 78 67 46 C86 15 103 46 132 53 C156 59 155 24 190 18 L190 110 L0 110 Z" />
          <path d="M0 104 C36 96 48 78 67 46 C86 15 103 46 132 53 C156 59 155 24 190 18" />
          <circle cx="67" cy="46" r="3" />
          <circle cx="132" cy="53" r="3" />
          <circle cx="190" cy="18" r="3" />
        </svg>
      </article>
      <article>
        <strong>{metrics.ctr}%</strong>
        <span>CTR</span>
        <p>업계 평균 대비 15%p 높음</p>
      </article>
      <article>
        <strong>{metrics.reservationRate}%</strong>
        <span>예약률</span>
        <p>업계 평균 대비 15%p 높음</p>
      </article>
    </section>
  );
}

function FunnelAnalysis({ metrics }: { metrics: MarketReportMetrics }) {
  const funnel = metrics.funnel;
  const steps = [
    ["노출", funnel.impressions.toLocaleString("ko-KR")],
    ["클릭", funnel.clicks.toLocaleString("ko-KR")],
    ["랜딩 페이지 방문", funnel.landingVisits.toLocaleString("ko-KR")],
    ["예약", funnel.reservations.toLocaleString("ko-KR")],
  ] as const;

  return (
    <section className="figma-report-card funnel-card">
      <h2>퍼널 분석</h2>
      <div className="funnel-grid">
        {steps.map(([label, value], index) => (
          <div className="funnel-step" key={label}>
            <div className="funnel-value"><span>{label}</span><strong>{value}</strong></div>
            <div className="funnel-bar"><i /></div>
            {index < steps.length - 1 ? <span className="funnel-arrow">10%<b>→</b></span> : null}
          </div>
        ))}
      </div>
      <p className="report-insight">예약 전환율이 가장 큰 하락 구간입니다</p>
    </section>
  );
}

function DemographicInsights() {
  return (
    <section className="figma-report-card demographic-card">
      <h2>인구통계학적 인사이트</h2>
      <div className="demographic-layout">
        <div className="gender-chart">
          <h3>성별</h3>
          <div className="gender-chart-body">
            <span className="gender-label gender-male">남<br />123</span>
            <div className="gender-donut"><span>전체<strong>432</strong></span></div>
            <span className="gender-label gender-female">여<br />000</span>
          </div>
        </div>
        <div className="age-chart">
          <h3>연령대</h3>
          {ageRows.map((label, index) => (
            <div className="age-row" key={`${label}-${index}`}>
              <span>{label}</span>
              <div><i /></div>
              <b>00%</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RegionInsights() {
  return (
    <section className="figma-report-card region-card">
      <h2>거주지</h2>
      <div className="region-chart-scroll" role="region" aria-label="거주지 비율 그래프" tabIndex={0}>
        <div className="region-chart">
          {regionBars.map((ratio, index) => (
            <div key={`${ratio}-${index}`}>
              <span className="region-bar-slot"><i style={{ height: `${Math.min(100, Math.max(0, ratio))}%` }} /></span>
              <span>지역명</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BehaviorInsights() {
  return (
    <section className="figma-report-card behavior-card">
      <h2>사용자 행동 패턴</h2>
      <div className="behavior-layout">
        <div className="average-time"><span>평균 체류시간</span><strong>42s</strong></div>
        <div className="scroll-time-list">
          <h3>스크롤 뎁스별 체류 시간</h3>
          {scrollRows.map(([depth, time]) => <div key={depth}><span>{depth}</span><b>{time}</b></div>)}
        </div>
      </div>
    </section>
  );
}

function ReservationList({ records, onDownload }: { records: readonly ReservationRecord[]; onDownload: () => void }) {
  return (
    <section className="report-reservations">
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
  metrics?: MarketReportMetrics;
};

export function CampaignReport({
  campaignId,
  publicSlug,
  initialSpec,
  initialSummary,
  metrics = demoMarketReportMetrics,
}: CampaignReportProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardPreviewRef = useRef<HTMLDivElement | null>(null);
  const refreshInFlightRef = useRef(false);
  const spec = initialSpec;
  const publicPath = `/p/${encodeURIComponent(publicSlug)}`;
  const fit = classifyMarketFitByCtr(metrics.ctr);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await fetch(`/api/campaigns?id=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("report_request_failed");
      const body = await response.json() as CampaignResponse;
      setSummary(body.summary);
      setLoadError("");
    } catch {
      setLoadError("최신 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [campaignId]);

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

  function syncActiveCard() {
    const scroller = cardPreviewRef.current;
    const slide = scroller?.querySelector<HTMLElement>(".creative-carousel-slide");
    if (!scroller || !slide) return;
    const gap = Number.parseFloat(window.getComputedStyle(scroller).columnGap) || 0;
    const step = slide.offsetWidth + gap;
    setActiveCardIndex(Math.min(4, Math.max(0, Math.round(scroller.scrollLeft / step))));
  }

  return (
    <main className="figma-report-page" data-market-fit={fit}>
      <div className="figma-report-container">
        <header className="report-result-heading">
          <span className="report-result-check"><CheckIcon size={20} /></span>
          <p>검증 결과</p>
          <h1>{fitCopy[fit]}</h1>
        </header>

        <div className="report-divider" />
        <MetricCards metrics={metrics} />
        <FunnelAnalysis metrics={metrics} />
        <DemographicInsights />
        <RegionInsights />
        <BehaviorInsights />

        <section className="report-creative-grid">
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
            <button className="report-outline-button" type="button" onClick={downloadCards} disabled={exporting}>
              {exporting ? "저장 중..." : "카드뉴스 저장"}
            </button>
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
