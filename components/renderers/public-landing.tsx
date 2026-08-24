"use client";

import { useState } from "react";
import type { CampaignSpec, SignalOptionId } from "@/lib/contracts/campaign";
import { CheckIcon } from "@/components/icons";
import { getVisitorId } from "@/lib/client/demo-store";

function isSignalResponse(value: unknown): value is { alreadyResponded: boolean } {
  return typeof value === "object"
    && value !== null
    && "alreadyResponded" in value
    && typeof value.alreadyResponded === "boolean";
}

export function PublicLanding({ spec, campaignId }: { spec: CampaignSpec; campaignId: string }) {
  const [selected, setSelected] = useState<SignalOptionId | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const reportPath = `/campaigns/${encodeURIComponent(campaignId)}`;

  async function submit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, visitorId: getVisitorId(), optionId: selected }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 409 && isSignalResponse(body) && body.alreadyResponded) {
        setDuplicate(true);
        return;
      }
      if (!response.ok || !isSignalResponse(body) || body.alreadyResponded) {
        throw new Error("signal_request_failed");
      }

      setSubmitted(true);
    } catch {
      setError("응답을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public-landing">
      <header className="landing-header">
        <a className="landing-brand" href="#top"><span>{spec.project.name}</span></a>
        <a className="landing-nav-cta" href="#signal">{spec.validation.signal.ctaLabel}</a>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">{spec.landing.hero.eyebrow}</span>
            <h1>{spec.messaging.valueProposition}</h1>
            <p>{spec.landing.hero.supportingText}</p>
            <a href="#signal" className="landing-primary-button">{spec.validation.signal.ctaLabel}</a>
            <small>연락처 없이 10초 만에 답할 수 있어요.</small>
          </div>
          <div className="landing-hero-art" aria-hidden="true">
            <div className="menu-card one"><span>시장검증 캠페인</span><strong>{spec.project.name}</strong><b>공개 준비</b></div>
            <div className="menu-card two"><span>익명 관심 신호</span><strong>{spec.validation.signal.options[0].label}</strong><b>개인정보 없음</b></div>
            <div className="hero-curve" />
          </div>
        </section>

        <section className="landing-problem landing-section">
          <span className="landing-kicker">REPEATED ROUTINE</span>
          <h2>{spec.validation.problem}</h2>
          <div className="landing-card-grid">
            {spec.landing.painPoints.map((item, index) => <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}
          </div>
        </section>

        <section className="landing-statement">
          <span>{spec.project.oneLiner}</span>
          <h2>{spec.messaging.hooks[1]}<br /><mark>{spec.messaging.hooks[2]}</mark></h2>
        </section>

        <section className="landing-benefits landing-section">
          <div className="landing-section-heading"><div><span className="landing-kicker">ONE CAMPAIGN</span><h2>같은 메시지로<br />처음부터 끝까지</h2></div><p>{spec.validation.solution}</p></div>
          <div className="benefit-list">
            {spec.landing.benefits.map((item, index) => <article key={item.title}><b>{index + 1}</b><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}
          </div>
        </section>

        <section className="landing-how landing-section">
          <span className="landing-kicker">HOW IT WORKS</span>
          <h2>세 단계 뒤에는<br />다음 판단만 남습니다.</h2>
          <div className="how-track">
            {spec.landing.steps.map((item, index) => <article key={item.title}><span>{index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}
          </div>
        </section>

        <section id="signal" className="signal-panel">
          <div className="signal-copy"><span className="landing-kicker">10-SECOND SIGNAL</span><h2>{spec.validation.signal.question}</h2><p>이름, 이메일, 전화번호는 받지 않습니다. 발표용 데모에서는 이 브라우저당 한 번만 응답할 수 있어요.</p></div>
          <div className="signal-form">
            {submitted ? (
              <div className="signal-success"><span><CheckIcon size={28} /></span><h3>응답이 기록됐어요</h3><p>{spec.validation.signal.successMessage}</p><a href={reportPath}>데모 리포트에서 확인하기</a></div>
            ) : duplicate ? (
              <div className="signal-success duplicate"><span><CheckIcon size={28} /></span><h3>이미 참여했어요</h3><p>최초 응답을 유지하고 중복으로 집계하지 않았습니다.</p><a href={reportPath}>데모 리포트 보기</a></div>
            ) : (
              <>
                <div className="signal-options">
                  {spec.validation.signal.options.map((option) => <button className={selected === option.id ? "selected" : ""} type="button" key={option.id} onClick={() => { setSelected(option.id); setError(""); }}><span>{option.label}</span>{selected === option.id && <CheckIcon size={18} />}</button>)}
                </div>
                {error && <p className="signal-error" role="alert">{error}</p>}
                <button className="landing-primary-button full" type="button" disabled={!selected || submitting} onClick={submit}>{submitting ? "저장 중..." : "익명으로 응답하기"}</button>
              </>
            )}
          </div>
        </section>

        <section className="landing-faq landing-section">
          <span className="landing-kicker">FAQ</span><h2>확인하고 참여하세요.</h2>
          <div>{spec.landing.faq.map((item) => <details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div>
        </section>
      </main>

      <footer className="landing-footer"><strong>{spec.project.name}</strong><p>이 페이지는 marketvalley로 만든 발표용 목캠페인입니다.</p><a href="/">Made with marketvalley</a></footer>
    </div>
  );
}
