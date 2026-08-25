"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import {
  GenerationProgressView,
  type GenerationProgressStage,
} from "@/components/generation-progress-view";
import type { CampaignGeneratorStatus } from "@/lib/ai/generatorConfig";
import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import { saveCampaignDraftId } from "@/lib/client/demo-store";

const example = {
  background:
    "동네에서 작은 카페를 운영합니다. 마감 시간이 가까워지면 멀쩡한 디저트와 샌드위치가 남지만, 이웃에게 알릴 방법이 없어 폐기하는 날이 많습니다. 매번 인스타그램 게시물을 새로 만들고 문의를 확인하는 일도 부담입니다.",
  solution:
    "서비스 이름은 ‘마감한입’입니다. 핵심 특징은 남은 메뉴 한 번 입력, 공개 페이지와 게시 카드 동시 생성, 동의 기반 예약자명단입니다. 카페 사장님이 남은 메뉴와 마감 시간을 입력하면 가까운 이웃이 볼 수 있는 광고가 자동으로 만들어집니다.",
};

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
  spec: CampaignSpec | null;
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

const submissionAcknowledgementDelayMs = 700;
const marketDataCollectionDelayMs = 2_000;

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("작업이 취소됐습니다.", "AbortError"));
      return;
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    function abort() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("작업이 취소됐습니다.", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

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
  return "광고 생성에 실패했어요. 다시 시도해주세요.";
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
  const [step, setStep] = useState<Step>(1);
  const [background, setBackground] = useState("");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressStage, setProgressStage] = useState<GenerationProgressStage>(0);
  const [completedCampaignId, setCompletedCampaignId] = useState<string | null>(null);
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
  const generatorNotice = usesLiveAI
    ? generatorStatus.ready
      ? null
      : "AI 문구 생성 · 회전된 API 키 설정 필요"
    : "안전 데모 · AI 호출 없음";

  function loadExample() {
    setBackground(example.background);
    setSolution(example.solution);
    setError("");
  }

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
    setProgressStage(0);
    setCompletedCampaignId(null);
    try {
      const input = { background: background.trim(), solution: solution.trim() };
      const fingerprint = JSON.stringify(input);
      if (publishAttemptRef.current?.fingerprint !== fingerprint) {
        publishAttemptRef.current = {
          fingerprint,
          draftId: window.crypto.randomUUID(),
          spec: null,
        };
      }
      const attempt = publishAttemptRef.current;

      await delay(submissionAcknowledgementDelayMs, requestController.signal);
      setProgressStage(1);

      if (!attempt.spec) {
        const generateResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: requestController.signal,
        });
        if (!generateResponse.ok) {
          throw new Error(await responseErrorCode(generateResponse) ?? "generate_failed");
        }
        const generated: unknown = await generateResponse.json();
        if (typeof generated !== "object" || generated === null || !("spec" in generated)) {
          throw new Error("generate_response_invalid");
        }
        attempt.spec = campaignSpecSchema.parse(generated.spec);
      }

      setProgressStage(2);
      const publishResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: attempt.draftId, spec: attempt.spec }),
        signal: requestController.signal,
      });
      if (!publishResponse.ok) throw new Error("publish_failed");
      const published: unknown = await publishResponse.json();
      const campaignId = publishedCampaignId(published);
      saveCampaignDraftId(campaignId, attempt.draftId);
      setCompletedCampaignId(campaignId);

      await delay(marketDataCollectionDelayMs, requestController.signal);
      setProgressStage(3);
      requestControllerRef.current = null;
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
        current={progressStage}
        reportHref={completedCampaignId ? `/campaigns/${completedCampaignId}` : "/"}
      />
    );
  }

  return (
    <main className="wizard-page page-container">
      <div className="wizard-topline">
        <button type="button" className="text-button" onClick={loadExample}>예시 불러오기</button>
        {generatorNotice ? (
          <span className="mock-notice" role="status">
            <i /> {generatorNotice}
          </span>
        ) : null}
      </div>

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
            placeholder={step === 1 ? example.background : example.solution}
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
