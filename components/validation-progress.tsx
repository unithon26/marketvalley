import Image from "next/image";
import Link from "next/link";

import { CheckIcon } from "@/components/icons";

export type ValidationProgressStage = 0 | 1 | 2 | 3;

const progressStages = [
  {
    label: "접수",
    title: "제출 내용을 검토하고 있습니다",
    description: "입력하신 문제 정의와 솔루션을 확인하고 있습니다",
    image: "/progress/review.png",
  },
  {
    label: "준비 중",
    title: "광고 검증을 준비하고 있습니다",
    description: "검토한 내용을 바탕으로 광고 소재와 랜딩페이지를 제작하고 있습니다",
    image: "/progress/creative.png",
  },
  {
    label: "수집 중",
    title: "시장 반응 데이터를 수집하고 있습니다",
    description: "메타 광고를 통해 잠재 고객의 실제 반응을 확인하고 있습니다",
    image: "/progress/collection.png",
  },
  {
    label: "결과 도착",
    title: "시장 검증이 완료되었습니다",
    description: "수집된 행동 데이터를 기반으로 검증 결과를 확인해 주세요",
    image: "/progress/report.png",
  },
] as const;

function stepState(index: number, current: ValidationProgressStage): "done" | "active" | "pending" {
  if (current === 3) return "done";
  const activeIndex = current === 0 ? 1 : current;
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

export function ValidationProgress({
  current,
  reportHref,
}: {
  current: ValidationProgressStage;
  reportHref: string;
}) {
  const activeStage = progressStages[current];
  const lineProgress = current <= 1 ? 1 : 2;

  return (
    <main className="validation-progress-page page-container">
      <section className="validation-progress-copy" aria-live="polite">
        <Image
          className="validation-progress-illustration"
          src={activeStage.image}
          width={560}
          height={330}
          alt=""
          loading="eager"
          unoptimized
        />
        <h1>{activeStage.title}</h1>
        <p>{activeStage.description}</p>
      </section>

      <section className="validation-stage-card">
        <span className="validation-eta">결과 도착까지 24시간</span>
        <ol className={`stage-line stage-progress-${lineProgress}`} aria-label="광고 검증 진행 상황">
          {progressStages.map((stage, index) => {
            const state = stepState(index, current);
            return (
              <li key={stage.label} className={state} aria-current={state === "active" ? "step" : undefined}>
                <span>
                  {state === "done" ? <CheckIcon size={14} /> : state === "active" ? <i /> : null}
                </span>
                <b>{stage.label}</b>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="progress-actions">
        {current === 3 ? (
          <Link className="button button-primary" href={reportHref}>시장 검증 리포트 확인하기</Link>
        ) : (
          <Link className="button button-secondary" href="/">메인으로</Link>
        )}
      </div>
    </main>
  );
}
