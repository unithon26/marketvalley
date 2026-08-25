import { CheckIcon } from "@/components/icons";

export type GenerationProgressStage = 0 | 1 | 2 | 3;

const stages = [
  {
    label: "접수",
    title: "광고 검증 요청이 접수되었습니다",
    description: "입력한 내용을 확인한 뒤 광고 제작을 시작합니다.",
  },
  {
    label: "준비 중",
    title: "카드뉴스와 랜딩페이지를 제작하고 있습니다",
    description: "검토한 내용을 바탕으로 두 광고 결과물을 함께 만들고 있습니다.",
  },
  {
    label: "수집 중",
    title: "카드뉴스와 랜딩페이지 제작을 완료했어요",
    description: "제작된 광고를 통해 시장 데이터를 수집하고 있습니다.",
  },
  {
    label: "결과 도착",
    title: "시장 데이터 수집이 완료되었습니다",
    description: "수집된 결과를 확인할 수 있는 리포트로 이동합니다.",
  },
] as const;

const actionLabels = ["접수 확인 중", "광고 제작 중", "시장 데이터 수집 중", "리포트로 이동 중"] as const;

export function GenerationProgressView({ current }: { current: GenerationProgressStage }) {
  const activeStage = stages[current];

  return (
    <main className="progress-page page-container">
      <div className="progress-heading-row">
        <div>
          <span className="eyebrow">VALIDATION IN PROGRESS</span>
          <h1>광고 검증을 준비하고 있습니다</h1>
        </div>
        <div className="eta-card">
          <span>결과 제공까지</span>
          <strong>{current === 3 ? "완료" : "약 2일"}</strong>
        </div>
      </div>

      <ol className="stage-line" aria-label="광고 검증 진행 상황">
        {stages.map((stage, index) => {
          const completed = index < current;
          const active = index === current;
          return (
            <li
              key={stage.label}
              className={completed ? "done" : active ? "active" : ""}
              aria-current={active ? "step" : undefined}
            >
              <span>{completed ? <CheckIcon size={16} /> : index + 1}</span>
              <b>{stage.label}</b>
            </li>
          );
        })}
      </ol>

      <section className="processing-visual" aria-live="polite">
        <div className={`processing-orb stage-${current}`}><i /><i /><i /></div>
        <span className="processing-status">{activeStage.label}</span>
        <h2>{activeStage.title}</h2>
        <p>{activeStage.description}</p>
      </section>

      <div className="progress-actions">
        <button className="button button-disabled" type="button" disabled>
          {actionLabels[current]}
        </button>
      </div>
    </main>
  );
}
