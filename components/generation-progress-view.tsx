import { CheckIcon } from "@/components/icons";

export type GenerationProgressStage = 0 | 1 | 2 | 3;

const stages = [
  {
    label: "시장 조사 준비",
    eta: "약 2초",
    title: "시장 조사 연결 전 단계를 확인하고 있어요",
    description: "외부 시장 조사는 아직 연결되지 않아, 이 데모 단계는 2초 뒤 넘어갑니다.",
  },
  {
    label: "AI 문구 생성",
    eta: "최대 1분",
    title: "AI가 광고 문구를 만들고 있어요",
    description: "실제 AI 응답이 완료될 때까지 이 단계에서 기다립니다.",
  },
  {
    label: "광고 구성",
    eta: "처리 중",
    title: "랜딩·카드뉴스 결과를 저장하고 있어요",
    description: "실제 광고 게시가 완료되면 자동으로 다음 화면으로 이동합니다.",
  },
  {
    label: "결과 도착",
    eta: "완료",
    title: "랜딩·캐러셀·게시 준비가 끝났어요",
    description: "완성된 시장검증 광고 리포트로 이동합니다.",
  },
] as const;

export function GenerationProgressView({ current }: { current: GenerationProgressStage }) {
  const activeStage = stages[current];

  return (
    <main className="progress-page page-container">
      <div className="progress-heading-row">
        <div>
          <span className="eyebrow">GENERATION IN PROGRESS</span>
          <h1>시장검증 광고를 준비하고 있어요</h1>
        </div>
        <div className="eta-card">
          <span>현재 단계</span>
          <strong>{activeStage.eta}</strong>
        </div>
      </div>

      <ol className="stage-line" aria-label="광고 생성 진행 상황">
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
          {current === 3 ? "리포트로 이동 중" : "광고 구성 중"}
        </button>
      </div>
    </main>
  );
}
