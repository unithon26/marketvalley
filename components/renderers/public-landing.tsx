"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignSpec } from "@/lib/contracts/campaign";
import type { ReservationUtm } from "@/lib/contracts/repository";
import { CheckIcon } from "@/components/icons";
import { campaignThemeStyle } from "@/lib/brand-theme";
import { getVisitorId } from "@/lib/client/visitor-store";

const reservationCtaLabel = "사전예약하기";

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: string;
    language: string;
    theme: "light";
    callback: (token: string) => void;
    "error-callback": () => void;
    "expired-callback": () => void;
    "timeout-callback": () => void;
    "unsupported-callback": () => void;
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function isReservationResponse(value: unknown): value is { alreadyReserved: boolean } {
  return typeof value === "object"
    && value !== null
    && "alreadyReserved" in value
    && typeof value.alreadyReserved === "boolean";
}

function currentUtm(): ReservationUtm | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: ReservationUtm = {
    source: params.get("utm_source") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
    content: params.get("utm_content") ?? undefined,
  };
  return Object.values(utm).some((value) => value !== undefined) ? utm : undefined;
}

function IntroAction({ spec }: { spec: CampaignSpec }) {
  return (
    <div className="landing-hero-copy landing-intro-action">
      <p>{spec.landing.hero.supportingText}</p>
      <a href="#reserve" className="landing-primary-button">{reservationCtaLabel}</a>
      <small>10초면 예약할 수 있어요.</small>
    </div>
  );
}

function LandingIntro({ spec }: { spec: CampaignSpec }) {
  const template = spec.templates.landingIntro;
  const featureKeywords = spec.landing.benefits.map((benefit) => benefit.title);

  if (template === "intro-1") {
    return (
      <section className="landing-intro landing-intro-1">
        <div className="landing-intro-frame">
          <h1>{spec.messaging.hooks[0]}</h1>
          <div className="intro-problem-stack">
            {spec.landing.painPoints.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.body}</p></article>)}
          </div>
          <div className="intro-hashtags">{featureKeywords.map((feature) => <span key={feature}>#{feature}</span>)}</div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  if (template === "intro-2") {
    return (
      <section className="landing-intro landing-intro-2">
        <div className="landing-intro-frame">
          <span className="intro-eyebrow">{spec.messaging.valueProposition}</span>
          <h1>{spec.project.name}</h1>
          <div className="intro-full-art" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  if (template === "intro-3") {
    return (
      <section className="landing-intro landing-intro-3">
        <div className="landing-intro-frame">
          <span className="intro-eyebrow">{spec.project.category}</span>
          <h1>{spec.messaging.hooks[0]}</h1>
          <div className="intro-issue-list">
            {spec.landing.benefits.map((item, index) => <article key={item.title}><div><strong>{item.title}</strong><p>{item.body}</p></div><span>0{index + 1}</span></article>)}
          </div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  if (template === "intro-4") {
    return (
      <section className="landing-intro landing-intro-4">
        <div className="landing-intro-frame">
          <span className="intro-eyebrow">{spec.messaging.valueProposition}</span>
          <h1><mark>{spec.project.name}</mark></h1>
          <div className="intro-window-art" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  if (template === "intro-5") {
    return (
      <section className="landing-intro landing-intro-5">
        <div className="landing-intro-frame">
          <span className="intro-rule-label">한 줄 핵심 특징</span>
          <h1 className={spec.project.oneLiner.length > 80 ? "intro-long-copy" : ""}><span>{spec.project.name}</span>{spec.project.oneLiner}</h1>
          <div className="intro-signal-seal"><b>10초</b><span>예약 신호</span></div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  if (template === "intro-6") {
    return (
      <section className="landing-intro landing-intro-6">
        <div className="landing-intro-frame">
          <span className="intro-eyebrow">{spec.messaging.valueProposition}</span>
          <h1>{spec.project.name}</h1>
          <i className="intro-divider" aria-hidden="true" />
          <div className="intro-square-art" aria-hidden="true"><span>{spec.project.name}</span><i /><i /></div>
          <div className="intro-hashtags">{featureKeywords.map((feature) => <span key={feature}>#{feature}</span>)}</div>
        </div>
        <IntroAction spec={spec} />
      </section>
    );
  }

  return (
    <section className="landing-intro landing-intro-7">
      <div className="landing-intro-frame">
        <span className="intro-rule-label">특징 키워드 · {featureKeywords.join(" · ")}</span>
        <h1>{spec.project.name}</h1>
        <p className="intro-bottom-copy">{spec.project.oneLiner}<br />{featureKeywords.join(" · ")}</p>
      </div>
      <IntroAction spec={spec} />
    </section>
  );
}

export function PublicLanding({
  spec,
  campaignId,
  turnstileSiteKey,
}: {
  spec: CampaignSpec;
  campaignId: string;
  turnstileSiteKey?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const captchaReady = !turnstileSiteKey || turnstileToken !== "";
  const canSubmit = name.trim() !== "" && email.trim() !== "" && consent && captchaReady;

  const renderTurnstile = useCallback(() => {
    if (
      !turnstileSiteKey
      || !turnstileContainer.current
      || !window.turnstile
      || turnstileWidgetId.current
    ) return;
    const resetExpiredWidget = () => {
      setTurnstileToken("");
      setCaptchaError("확인 시간이 지나 다시 확인해주세요.");
      const widgetId = turnstileWidgetId.current;
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    };
    turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
      sitekey: turnstileSiteKey,
      action: "reservation",
      language: "ko",
      theme: "light",
      callback: (token) => {
        setTurnstileToken(token);
        setCaptchaError("");
        setError("");
      },
      "error-callback": () => {
        setTurnstileToken("");
        setCaptchaError("자동 제출 방지 확인을 불러오지 못했어요.");
      },
      "expired-callback": resetExpiredWidget,
      "timeout-callback": resetExpiredWidget,
      "unsupported-callback": () => {
        setTurnstileToken("");
        setCaptchaError("현재 브라우저에서는 자동 제출 방지 확인을 사용할 수 없어요. 최신 브라우저에서 다시 시도해주세요.");
      },
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    renderTurnstile();
    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, [renderTurnstile]);

  useEffect(() => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(campaignId)) {
      return;
    }
    const controller = new AbortController();
    void fetch("/api/analytics/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, visitorId: getVisitorId() }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [campaignId]);

  function resetTurnstile() {
    setTurnstileToken("");
    if (turnstileWidgetId.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId.current);
    }
  }

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: name.trim(),
          email: email.trim(),
          consent: true,
          turnstileToken: turnstileSiteKey ? turnstileToken : undefined,
          utm: currentUtm(),
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 409 && isReservationResponse(body) && body.alreadyReserved) {
        setDuplicate(true);
        return;
      }
      if (!response.ok || !isReservationResponse(body) || body.alreadyReserved) {
        throw new Error("reservation_request_failed");
      }

      setSubmitted(true);
    } catch {
      resetTurnstile();
      setError("예약을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={renderTurnstile}
          onReady={renderTurnstile}
          onError={() => setCaptchaError("자동 제출 방지 확인을 불러오지 못했어요.")}
        />
      )}
    <div
      className="public-landing"
      style={campaignThemeStyle(spec.brand)}
      data-brand-tone={spec.brand.tone}
      data-landing-template={spec.templates.landingIntro}
      data-product-name={spec.project.name}
    >
      <header className="landing-header">
        <a className="landing-brand" href="#top"><span>{spec.project.name}</span></a>
        <a className="landing-nav-cta" href="#reserve">{reservationCtaLabel}</a>
      </header>

      <main id="top">
        <LandingIntro spec={spec} />

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

        <section id="reserve" className="signal-panel">
          <div className="signal-copy">
            <span className="landing-kicker">RESERVE NOW</span>
            <h2>{spec.project.name}, 지금 예약자명단에 이름을 남겨주세요</h2>
            <p>입력하신 이름과 이메일은 예약자명단 확인 목적에만 사용되며, 동의하신 경우에만 저장됩니다.</p>
          </div>
          <div className="signal-form">
            {submitted ? (
              <div className="signal-success"><span><CheckIcon size={28} /></span><h3>예약이 접수됐어요</h3><p>입력한 이메일로 다음 안내를 전달할 수 있도록 운영자 예약자명단에 안전하게 저장했습니다.</p></div>
            ) : duplicate ? (
              <div className="signal-success duplicate"><span><CheckIcon size={28} /></span><h3>이미 예약했어요</h3><p>같은 이메일로 접수된 기존 예약을 유지하고 있습니다.</p></div>
            ) : (
              <>
                <div className="reservation-fields">
                  <div className="reservation-field">
                    <label htmlFor="reservation-name">이름</label>
                    <input
                      id="reservation-name"
                      type="text"
                      value={name}
                      maxLength={80}
                      onChange={(event) => { setName(event.target.value); setError(""); }}
                    />
                  </div>
                  <div className="reservation-field">
                    <label htmlFor="reservation-email">이메일</label>
                    <input
                      id="reservation-email"
                      type="email"
                      value={email}
                      maxLength={200}
                      onChange={(event) => { setEmail(event.target.value); setError(""); }}
                    />
                  </div>
                  <label className="reservation-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    이름과 이메일 수집에 동의합니다
                  </label>
                  {turnstileSiteKey && (
                    <>
                      <div ref={turnstileContainer} aria-label="자동 제출 방지 확인" />
                      {captchaError && (
                        <p className="signal-error" role="alert">
                          {captchaError}{" "}
                          <button type="button" onClick={() => window.location.reload()}>
                            다시 불러오기
                          </button>
                        </p>
                      )}
                    </>
                  )}
                </div>
                {error && <p className="signal-error" role="alert">{error}</p>}
                <button className="landing-primary-button full" type="button" disabled={!canSubmit || submitting} onClick={submit}>{submitting ? "예약 접수 중..." : reservationCtaLabel}</button>
              </>
            )}
          </div>
        </section>

        <section className="landing-faq landing-section">
          <span className="landing-kicker">FAQ</span><h2>확인하고 참여하세요.</h2>
          <div>{spec.landing.faq.map((item) => <details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div>
        </section>
      </main>

      <footer className="landing-footer"><strong>{spec.project.name}</strong><p>이 페이지는 실제 시장 반응을 수집하기 위해 marketvalley로 제작되었습니다.</p><a href="/">Made with marketvalley</a></footer>
    </div>
    </>
  );
}
