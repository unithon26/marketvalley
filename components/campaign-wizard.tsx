"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { GenerationProgressView } from "@/components/generation-progress-view";
import type { CampaignGeneratorStatus } from "@/lib/ai/generatorConfig";

type Step = 1 | 2;
const wizardHistoryKey = "marketvalleyWizardStep";

export function resolveWizardStep(state: unknown): Step {
  if (typeof state !== "object" || state === null) return 1;
  return wizardHistoryKey in state && state[wizardHistoryKey] === 2 ? 2 : 1;
}

export function createWizardHistoryState(state: unknown, step: Step): Record<string, unknown> {
  const base = typeof state === "object" && state !== null ? state : {};
  return { ...base, [wizardHistoryKey]: step };
}

type PublishAttempt = {
  fingerprint: string;
  draftId: string;
};

function publishedCampaignId(value: unknown): string {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string") {
    throw new Error("publish_response_invalid");
  }
  return value.id;
}

type CampaignWizardProps = {
  generatorStatus: CampaignGeneratorStatus;
};

function generationErrorMessage(code: string | null): string {
  if (code === "authentication_required") {
    return "AI 문구 생성을 위해 먼저 Google로 로그인해주세요.";
  }
  if (code === "generation_rate_limited") {
    return "AI 문구 생성 요청이 많아요. 잠시 후 다시 시도해주세요.";
  }
  if (code === "anthropic_billing_error") {
    return "AI 생성 사용 한도가 부족해요. API 결제·사용 한도를 확인해주세요.";
  }
  if (code === "campaign_generator_not_configured" || code === "auth_not_configured") {
    return "AI 문구 생성 설정을 확인해주세요.";
  }
  return "접수하지 못했어요. 입력은 그대로 유지됩니다. 잠시 후 다시 시도해주세요.";
}

async function responseErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object"
      && body !== null
      && "error" in body
      && typeof body.error === "object"
      && body.error !== null
      && "code" in body.error
      && typeof body.error.code === "string"
    ) {
      return body.error.code;
    }
  } catch {
    return null;
  }
  return null;
}

export function CampaignWizard({ generatorStatus }: CampaignWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [background, setBackground] = useState("");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const publishAttemptRef = useRef<PublishAttempt | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function syncStep(event: PopStateEvent) {
      setStep(resolveWizardStep(event.state));
      setError("");
    }

    window.addEventListener("popstate", syncStep);
    return () => {
      window.removeEventListener("popstate", syncStep);
      requestControllerRef.current?.abort();
    };
  }, []);

  const canContinue = step === 1 ? background.trim().length >= 20 : solution.trim().length >= 20;
  const usesLiveAI = generatorStatus.mode !== "fixture";
  const generatorNotice = usesLiveAI && !generatorStatus.ready
    ? "AI 생성 연결을 확인해주세요"
    : null;

  async function next() {
    if (!canContinue) {
      setError("발표에서 이해할 수 있도록 20자 이상 구체적으로 적어주세요.");
      return;
    }
    setError("");
    if (step === 1) {
      window.history.pushState(
        createWizardHistoryState(window.history.state, 2),
        "",
        window.location.href,
      );
      setStep(2);
      return;
    }
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    setSubmitting(true);
    try {
      const input = { background: background.trim(), solution: solution.trim() };
      const fingerprint = JSON.stringify(input);
      if (publishAttemptRef.current?.fingerprint !== fingerprint) {
        publishAttemptRef.current = {
          fingerprint,
          draftId: window.crypto.randomUUID(),
        };
      }
      const attempt = publishAttemptRef.current;
      const publishResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: attempt.draftId, input }),
        signal: requestController.signal,
      });
      if (!publishResponse.ok) {
        throw new Error(await responseErrorCode(publishResponse) ?? "submission_failed");
      }
      const published: unknown = await publishResponse.json();
      const campaignId = publishedCampaignId(published);
      requestControllerRef.current = null;
      router.push(`/campaigns/${encodeURIComponent(campaignId)}/progress`);
    } catch (caught) {
      if (requestController.signal.aborted) return;
      setError(generationErrorMessage(caught instanceof Error ? caught.message : null));
      requestControllerRef.current = null;
      setSubmitting(false);
    }
  }

  function previous() {
    window.history.back();
  }

  if (submitting) {
    return (
      <GenerationProgressView
        current={0}
        reportHref="/"
      />
    );
  }

  return (
    <main className="wizard-page page-container">
      {generatorNotice ? (
        <div className="wizard-topline">
          <span className="service-notice" role="status">
            <i /> {generatorNotice}
          </span>
        </div>
      ) : null}

      <section className="wizard-panel">
        <div className="step-kicker">{step}/2</div>
        <h1>{step === 1 ? "제품을 만들게 된 배경을 입력해주세요" : "어떤 솔루션을 제공할 예정인가요?"}</h1>
        <p className="wizard-description">
          {step === 1
            ? "최근 겪은 상황과 지금 반복하고 있는 일을 말하듯 적어주세요."
            : "제품·서비스 이름과 핵심 기능·특징을 함께 적으면 랜딩과 카드뉴스에 자동으로 반영돼요."}
        </p>
        <label className="textarea-wrap">
          <span className="sr-only">{step === 1 ? "제품 배경" : "솔루션 설명"}</span>
          <textarea
            maxLength={step === 1 ? 600 : 500}
            value={step === 1 ? background : solution}
            onChange={(event) => step === 1 ? setBackground(event.target.value) : setSolution(event.target.value)}
            placeholder={step === 1
              ? "누가 어떤 상황에서 어떤 일을 반복하고 있는지, 왜 해결하려는지 구체적으로 적어주세요."
              : "서비스 이름, 제공할 핵심 가치, 사용자가 하게 될 행동을 구체적으로 적어주세요."}
            autoFocus
          />
          <span className="char-count">{(step === 1 ? background : solution).length}/{step === 1 ? 600 : 500}</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="wizard-actions">
          {step === 2 && <button className="button button-secondary" type="button" onClick={previous}>이전</button>}
          <button
            className="button button-primary"
            type="button"
            onClick={next}
            disabled={submitting || (step === 2 && !generatorStatus.ready)}
          >
            {step === 1
              ? <>다음 <ArrowRightIcon size={17} /></>
              : !generatorStatus.ready
                ? "AI 설정 필요"
                : <>광고 만들기 <ArrowRightIcon size={17} /></>}
          </button>
        </div>
      </section>
    </main>
  );
}
