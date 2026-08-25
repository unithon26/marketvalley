"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { ArrowRightIcon, CheckIcon, DownloadIcon } from "@/components/icons";
import { carouselFileNames } from "@/components/renderers/carousel-card";
import type { CampaignResponse } from "@/lib/contracts/api";
import { emptyCampaignAnalytics, type CampaignAnalytics } from "@/lib/contracts/analytics";
import type { ReservationRecord, ReservationSummary } from "@/lib/contracts/repository";
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

function formatKoreanDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "동기화 시각 확인 불가";
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const year = korea.getUTCFullYear();
  const month = String(korea.getUTCMonth() + 1).padStart(2, "0");
  const day = String(korea.getUTCDate()).padStart(2, "0");
  const hour = String(korea.getUTCHours()).padStart(2, "0");
  const minute = String(korea.getUTCMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null || !currency) return "집계 전";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCards({ metrics, isPresentation }: { metrics: CampaignAnalytics; isPresentation: boolean }) {
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
        <p>{metrics.updatedAt ? `${isPresentation ? "예시 집계 종료" : "마지막 동기화"} ${formatKoreanDateTime(metrics.updatedAt)}` : "Meta Insights 집계 전"}</p>
      </article>
      <article>
        <strong>{formatMetric(reservationRate, "%")}</strong>
        <span>예약률</span>
        <p>실제 고유 방문 대비 예약</p>
      </article>
    </section>
  );
}

function FunnelAnalysis({ metrics, isPresentation }: { metrics: CampaignAnalytics; isPresentation: boolean }) {
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
      <p className="report-insight">
        {isPresentation
          ? "발표용 예시 퍼널입니다. 실제 운영 화면은 Meta Insights, 고유 방문, 예약 기록에서만 계산합니다."
          : "모든 값은 실제 Meta Insights, 고유 방문, 예약 기록에서만 계산됩니다."}
      </p>
    </section>
  );
}

function MetaDetail({ metrics, isPresentation }: { metrics: CampaignAnalytics; isPresentation: boolean }) {
  if (metrics.status === "not_connected") return null;
  const costPerLinkClick = metrics.spendMinor !== null && metrics.linkClicks
    ? Math.round(metrics.spendMinor / metrics.linkClicks)
    : null;
  const frequency = metrics.impressions !== null && metrics.reach
    ? Math.round((metrics.impressions / metrics.reach) * 100) / 100
    : null;

  return (
    <section className="figma-report-card meta-detail-card report-animated-section" aria-label="Meta 집계 상세">
      <div className="report-section-title">
        <h2>Meta 집계 상세</h2>
        <span>{isPresentation ? "발표용 수집 완료 예시" : "Meta Insights"}</span>
      </div>
      <dl className="meta-detail-grid">
        <div><dt>도달</dt><dd>{formatMetric(metrics.reach, "명")}</dd></div>
        <div><dt>총 클릭</dt><dd>{formatMetric(metrics.clicks, "회")}</dd></div>
        <div><dt>광고비</dt><dd>{formatCurrency(metrics.spendMinor, metrics.currency)}</dd></div>
        <div><dt>링크 클릭당 비용</dt><dd>{formatCurrency(costPerLinkClick, metrics.currency)}</dd></div>
        <div><dt>평균 노출 빈도</dt><dd>{formatMetric(frequency, "회")}</dd></div>
        <div><dt>랜딩 도달률</dt><dd>{formatMetric(calculateRate(metrics.landingVisits, metrics.linkClicks), "%")}</dd></div>
      </dl>
    </section>
  );
}

function MeasurementCoverage({ metrics, isPresentation }: { metrics: CampaignAnalytics; isPresentation: boolean }) {
  return (
    <section className="figma-report-card demographic-card report-animated-section">
      <h2>계측 상태</h2>
      <div className="demographic-layout">
        <div>
          <h3>Meta 광고</h3>
          <p>{isPresentation ? "24시간 수집 완료 예시" : metrics.status === "not_connected" ? "광고 연결 전" : metrics.status === "collecting" ? "광고 심사·집계 중" : metrics.status === "final" ? "최종 집계" : "예비 집계"}</p>
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
  initialSummary: ReservationSummary;
  initialAnalytics?: CampaignAnalytics;
  presentationMode?: { collectedHours: number };
};

export function CampaignReport({
  campaignId,
  publicSlug,
  initialSummary,
  initialAnalytics = emptyCampaignAnalytics,
  presentationMode,
}: CampaignReportProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [metrics, setMetrics] = useState(initialAnalytics);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const reportRootRef = useRef<HTMLElement | null>(null);
  const cardPreviewRef = useRef<HTMLDivElement | null>(null);
  const refreshInFlightRef = useRef(false);
  const publicPath = `/p/${encodeURIComponent(publicSlug)}`;
  const landingPreviewPath = `${publicPath}?preview=1`;
  const fit = classifyMarketFit(metrics);
  const isPresentation = presentationMode !== undefined;

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

  useEffect(() => {
    if (isPresentation) return;
    const refreshReport = () => { void refresh(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshReport();
    };
    const frame = window.requestAnimationFrame(refreshReport);
    const interval = window.setInterval(refreshReport, 60_000);
    window.addEventListener("focus", refreshReport);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshReport);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isPresentation, refresh]);

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

  async function downloadCards() {
    setExporting(true);
    setNotice("");
    try {
      const images = await Promise.all([1, 2, 3, 4, 5].map(async (index) => {
        const response = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/cards/${index}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("card_download_failed");
        return response.blob();
      }));
      const zip = new JSZip();
      images.forEach((blob, index) => zip.file(carouselFileNames[index], blob));
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
    <main ref={reportRootRef} className="figma-report-page" data-market-fit={fit}>
      <div className="figma-report-container">
        {presentationMode ? (
          <aside className="presentation-report-banner" role="note">
            <strong>{presentationMode.collectedHours}시간 수집 구간 스킵</strong>
            <span>발표용 수집 완료 예시</span>
            <p>
              아래 집계값과 예약자명은 녹화 시나리오를 위한 명시적 예시입니다.
              실제 제품 리포트는 Meta Insights·고유 랜딩 방문·동의 기반 예약 기록만 사용합니다.
            </p>
          </aside>
        ) : null}
        <header className="report-result-heading">
          <span className="report-result-check"><CheckIcon size={20} /></span>
          <p>검증 결과</p>
          <h1>{fitCopy[fit]}</h1>
        </header>

        <div className="report-divider" />
        <MetricCards metrics={metrics} isPresentation={isPresentation} />
        <MetaDetail metrics={metrics} isPresentation={isPresentation} />
        <FunnelAnalysis metrics={metrics} isPresentation={isPresentation} />
        <MeasurementCoverage metrics={metrics} isPresentation={isPresentation} />

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
                      <Image
                        className="creative-carousel-image"
                        src={`/api/campaigns/${encodeURIComponent(campaignId)}/cards/${index + 1}`}
                        width={1080}
                        height={1350}
                        alt={`${index + 1}번째 실제 광고 카드뉴스`}
                        unoptimized
                      />
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
          </article>
          <article className="figma-report-card landing-preview-card">
            <h2>랜딩페이지</h2>
            <div className="landing-live-preview">
              <iframe src={landingPreviewPath} title="AI가 생성한 랜딩페이지 미리보기" loading="lazy" />
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
    </main>
  );
}
