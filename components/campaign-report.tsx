"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon } from "@/components/icons";
import { CarouselCard, carouselFileNames } from "@/components/renderers/carousel-card";
import type { NextAction } from "@/lib/contracts/campaign";
import { readNextAction, readSignals, resetDemo, saveNextAction } from "@/lib/client/demo-store";
import { demoCampaign, evaluateDecision, seedSignals } from "@/lib/demo/demo-campaign";
import { createNextActionState } from "@/lib/demo/campaignSignals";

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusCopy(status: ReturnType<typeof evaluateDecision>["decisionStatus"]) {
  if (status === "threshold_met") return { label: "기준 도달", tone: "positive", description: "사전에 승인한 최소 표본과 긍정 신호 기준에 도달했습니다." };
  if (status === "threshold_not_met") return { label: "가설 재검토", tone: "warning", description: "표본은 모였지만 현재 메시지의 긍정 신호 기준에는 도달하지 않았습니다." };
  return { label: "표본 수 부족", tone: "neutral", description: "아직 결론을 내리지 않고 응답 분포와 남은 표본만 보여드립니다." };
}

export function CampaignReport() {
  const [signals, setSignals] = useState(() => [...seedSignals]);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const summary = useMemo(() => evaluateDecision(signals), [signals]);
  const state = useMemo(() => createNextActionState(nextAction), [nextAction]);
  const status = statusCopy(summary.decisionStatus);
  const positiveDegrees = summary.total ? (summary.positive / summary.total) * 360 : 0;
  const neutralDegrees = summary.total ? ((summary.positive + summary.neutral) / summary.total) * 360 : 0;

  useEffect(() => {
    const refresh = () => {
      setSignals(readSignals());
      setNextAction(readNextAction());
    };
    const animationFrame = window.requestAnimationFrame(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("marketvalley:demo-updated", refresh);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("marketvalley:demo-updated", refresh);
    };
  }, []);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label}을 복사했어요.`);
    } catch {
      setNotice("복사 권한을 확인한 뒤 다시 시도해주세요.");
    }
  }

  async function renderCards() {
    return Promise.all(cardRefs.current.map(async (node, index) => {
      if (!node) throw new Error(`${index + 1}번 카드 렌더러가 없습니다.`);
      return toPng(node, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: false });
    }));
  }

  async function downloadZip() {
    setExporting(true);
    setNotice("");
    try {
      const images = await renderCards();
      const zip = new JSZip();
      images.forEach((dataUrl, index) => zip.file(carouselFileNames[index], dataUrl.split(",")[1], { base64: true }));
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "magamhanip-carousel.zip");
      setNotice("캐러셀 PNG 5장을 ZIP으로 만들었어요.");
    } catch {
      setNotice("PNG 생성에 실패했어요. 브라우저를 새로고침한 뒤 다시 시도해주세요.");
    } finally {
      setExporting(false);
    }
  }

  function downloadMetaPackage() {
    const text = [
      "[Meta 게시 준비 — 실제 게시 아님]",
      `기본 문구: ${demoCampaign.messaging.caption}`,
      `Headline: ${demoCampaign.messaging.hooks[0]}`,
      `CTA: ${demoCampaign.validation.signal.ctaLabel}`,
      `대상 고객 가설: ${demoCampaign.validation.customer}`,
      "Destination URL: /p/demo",
      `Hashtags: ${demoCampaign.messaging.hashtags.join(" ")}`,
    ].join("\n\n");
    triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), "meta-ready.txt");
    setNotice("Meta 게시 준비 파일을 만들었어요. 실제 광고는 등록되지 않았습니다.");
  }

  function chooseAction(action: NextAction) {
    saveNextAction(action);
    setNextAction(action);
    setNotice("다음 행동을 저장했어요.");
  }

  function reset() {
    resetDemo();
    setSignals(readSignals());
    setNextAction(null);
    setNotice("발표용 응답과 판단을 초기화했어요.");
  }

  return (
    <main className="report-page page-container">
      <div className="report-intro">
        <span className="report-check"><CheckIcon /></span>
        <div><span className="eyebrow">마감한입 · DEMO CAMPAIGN</span><h1>검증 리포트를 보여드릴게요</h1><p>모든 수치는 발표 흐름을 확인하기 위한 목데이터입니다.</p></div>
      </div>

      <section className="status-banner">
        <div><span>시장검증 상태</span><strong>{status.description}</strong></div>
        <b className={`status-pill ${status.tone}`}>{status.label}</b>
      </section>

      <section className="metric-grid">
        <article><span>선택형 응답</span><strong>{summary.total}<small>건</small></strong><p>개인정보 없는 데모 응답</p></article>
        <article><span>긍정 신호율</span><strong>{Math.round((summary.positiveRate ?? 0) * 100)}<small>%</small></strong><p>긍정 {summary.positive} / 전체 {summary.total}</p></article>
        <article><span>판단 기준까지</span><strong>{summary.remainingResponses}<small>건</small></strong><p>{demoCampaign.validation.decisionRule.description}</p></article>
      </section>

      <section className="report-section response-section">
        <div className="section-heading"><div><span className="eyebrow">ACTUAL DEMO SIGNALS</span><h2>응답 분포</h2></div><Link className="button button-secondary" href="/p/demo" target="_blank">공개 랜딩 열기 <ExternalIcon size={17} /></Link></div>
        <div className="response-layout">
          <div className="donut" style={{ "--positive": `${positiveDegrees}deg`, "--neutral": `${neutralDegrees}deg` } as React.CSSProperties}><span><b>{summary.total}</b>응답</span></div>
          <div className="distribution-list">
            {demoCampaign.validation.signal.options.map((option) => {
              const count = summary[option.id];
              const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return <div key={option.id}><div><span><i className={option.id} />{option.label}</span><b>{count}건 · {percent}%</b></div><div className="distribution-track"><i className={option.id} style={{ width: `${percent}%` }} /></div></div>;
            })}
          </div>
        </div>
        <p className="data-note">현재 브라우저에 준비된 seed 응답과 `/p/demo`에서 제출한 응답만 표시합니다. 실제 사용자 조사 결과가 아닙니다.</p>
      </section>

      <section className="report-section deliverables-section">
        <div className="section-heading"><div><span className="eyebrow">READY TO USE</span><h2>캠페인 결과물</h2></div><span className="safe-label">외부 계정·광고비 사용 없음</span></div>
        <div className="deliverable-grid">
          <article><div className="deliverable-icon landing-icon">↗</div><div><h3>공개 랜딩페이지</h3><p>같은 CampaignSpec으로 렌더링되는 발표용 공개 경로</p><code>/p/demo</code></div><Link className="icon-button" href="/p/demo" target="_blank" aria-label="공개 랜딩 열기"><ExternalIcon /></Link></article>
          <article><div className="deliverable-icon carousel-icon">05</div><div><h3>Instagram 캐러셀</h3><p>1080×1350 PNG 5장 · 결정적 React/CSS 렌더러</p><code>01-hook.png — 05-cta.png</code></div><button className="icon-button" type="button" onClick={downloadZip} disabled={exporting} aria-label="캐러셀 ZIP 다운로드"><DownloadIcon /></button></article>
          <article><div className="deliverable-icon meta-icon">M</div><div><h3>Meta 게시 준비</h3><p>미디어·문구·CTA·대상 고객 가설·URL을 한 파일로</p><code>실제 게시 또는 집행 아님</code></div><button className="icon-button" type="button" onClick={downloadMetaPackage} aria-label="Meta 게시 준비 다운로드"><DownloadIcon /></button></article>
        </div>
        <div className="copy-grid">
          <div><span>게시 문구</span><p>{demoCampaign.messaging.caption}</p><button type="button" onClick={() => copyText(demoCampaign.messaging.caption, "게시 문구")}><CopyIcon size={16} /> 복사</button></div>
          <div><span>CTA</span><p>{demoCampaign.validation.signal.ctaLabel}</p><button type="button" onClick={() => copyText(demoCampaign.validation.signal.ctaLabel, "CTA")}><CopyIcon size={16} /> 복사</button></div>
        </div>
      </section>

      <section className="report-section decision-section">
        <div className="section-heading"><div><span className="eyebrow">HUMAN DECISION</span><h2>다음 행동은 직접 선택해주세요</h2></div></div>
        <p>AI가 시장성을 판정하지 않습니다. 사전 기준과 현재 표본을 보고 사람이 다음 행동을 남깁니다.</p>
        <div className="decision-grid">
          {state.options.map((option) => <button className={option.selected ? "selected" : ""} type="button" key={option.action} onClick={() => chooseAction(option.action)}><span>{option.label}</span><p>{option.description}</p>{option.selected && <CheckIcon size={18} />}</button>)}
        </div>
      </section>

      <div className="report-footer-actions"><button className="text-button danger" type="button" onClick={reset}>데모 데이터 초기화</button><Link className="button button-secondary" href="/new">새 캠페인 만들기</Link></div>
      {notice && <div className="toast" role="status">{notice}</div>}

      <div className="export-stage" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => <CarouselCard key={index} spec={demoCampaign} index={index} exportRef={(node) => { cardRefs.current[index] = node; }} />)}
      </div>
    </main>
  );
}
