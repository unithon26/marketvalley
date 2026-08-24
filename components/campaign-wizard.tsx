"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";

const example = {
  background:
    "동네에서 작은 카페를 운영합니다. 마감 시간이 가까워지면 멀쩡한 디저트와 샌드위치가 남지만, 이웃에게 알릴 방법이 없어 폐기하는 날이 많습니다. 매번 인스타그램 게시물을 새로 만들고 문의를 확인하는 일도 부담입니다.",
  solution:
    "카페 사장님이 남은 메뉴와 마감 시간을 입력하면, 가까운 이웃이 볼 수 있는 소개 페이지와 게시용 카드가 자동으로 만들어집니다. 방문자는 개인정보 없이 오늘 구매 의향만 선택해 답합니다.",
};

type Step = 1 | 2;

export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [background, setBackground] = useState("");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const generateResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background, solution }),
      });
      if (!generateResponse.ok) throw new Error("generate_failed");
      const { spec } = await generateResponse.json();

      const draftId = window.crypto.randomUUID();
      const publishResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, spec }),
      });
      if (!publishResponse.ok) throw new Error("publish_failed");
      const published = await publishResponse.json();

      router.push(`/campaigns/${published.id}/progress`);
    } catch {
      setError("캠페인 생성에 실패했어요. 다시 시도해주세요.");
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
            : "누구에게 어떤 변화를 제공하는지, 실제 사용 장면을 중심으로 적어주세요."}
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
            {step === 1 ? <>다음 <ArrowRightIcon size={17} /></> : submitting ? "만드는 중..." : <>캠페인 만들기 <ArrowRightIcon size={17} /></>}
          </button>
        </div>
      </section>
    </main>
  );
}
