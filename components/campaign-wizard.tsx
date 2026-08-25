"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { campaignSpecSchema, type CampaignSpec } from "@/lib/contracts/campaign";
import { saveCampaignDraftId } from "@/lib/client/demo-store";

const example = {
  background:
    "동네에서 작은 카페를 운영합니다. 마감 시간이 가까워지면 멀쩡한 디저트와 샌드위치가 남지만, 이웃에게 알릴 방법이 없어 폐기하는 날이 많습니다. 매번 인스타그램 게시물을 새로 만들고 문의를 확인하는 일도 부담입니다.",
  solution:
    "서비스 이름은 ‘마감한입’입니다. 핵심 특징은 남은 메뉴 한 번 입력, 공개 페이지와 게시 카드 동시 생성, 동의 기반 예약자명단입니다. 카페 사장님이 남은 메뉴와 마감 시간을 입력하면 가까운 이웃이 볼 수 있는 광고가 자동으로 만들어집니다.",
};

type Step = 1 | 2;
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

export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [background, setBackground] = useState("");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const publishAttemptRef = useRef<PublishAttempt | null>(null);

  const canContinue = step === 1 ? background.trim().length >= 20 : solution.trim().length >= 20;

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
      setStep(2);
      return;
    }
    setSubmitting(true);
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

      if (!attempt.spec) {
        const generateResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!generateResponse.ok) throw new Error("generate_failed");
        const generated: unknown = await generateResponse.json();
        if (typeof generated !== "object" || generated === null || !("spec" in generated)) {
          throw new Error("generate_response_invalid");
        }
        attempt.spec = campaignSpecSchema.parse(generated.spec);
      }

      const publishResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: attempt.draftId, spec: attempt.spec }),
      });
      if (!publishResponse.ok) throw new Error("publish_failed");
      const published: unknown = await publishResponse.json();
      const campaignId = publishedCampaignId(published);
      saveCampaignDraftId(campaignId, attempt.draftId);

      router.push(`/campaigns/${campaignId}/progress`);
    } catch {
      setError("광고 생성에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="wizard-page page-container">
      <div className="wizard-topline">
        <button type="button" className="text-button" onClick={loadExample}>예시 불러오기</button>
        <span className="mock-notice"><i /> 외부 API 없는 발표용 목데이터</span>
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
          {step === 2 && <button className="button button-secondary" type="button" onClick={() => setStep(1)}>이전</button>}
          <button className="button button-primary" type="button" onClick={next} disabled={submitting}>
            {step === 1 ? <>다음 <ArrowRightIcon size={17} /></> : submitting ? "만드는 중..." : <>광고 만들기 <ArrowRightIcon size={17} /></>}
          </button>
        </div>
      </section>
    </main>
  );
}
