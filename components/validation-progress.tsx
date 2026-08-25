"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { CheckIcon } from "@/components/icons";

export type ValidationProgressStage = 0 | 1 | 2 | 3;

const progressStages = [
  {
    label: "접수",
    title: "아이디어의 핵심을 살펴보고 있어요",
    description: "입력한 배경과 솔루션에서 검증에 필요한 내용을 정리하고 있어요.",
    status: "아이디어 확인 중",
    image: "/progress/review.png",
  },
  {
    label: "준비 중",
    title: "하나의 메시지로 광고를 엮고 있어요",
    description: "검증 가설부터 랜딩페이지와 카드뉴스 문구까지 한 흐름으로 만들고 있어요.",
    status: "광고 초안 구성 중",
    image: "/progress/creative.png",
  },
  {
    label: "게시 중",
    title: "사람의 반응을 받을 페이지를 준비하고 있어요",
    description: "공개 페이지와 내려받을 광고 파일을 같은 내용으로 묶어 게시하고 있어요.",
    status: "공개 준비 중",
    image: "/progress/collection.png",
  },
  {
    label: "결과 도착",
    title: "광고 초안이 모두 준비됐어요",
    description: "이제 공개 페이지와 카드뉴스를 확인하고, 다음 판단을 이어갈 수 있어요.",
    status: "준비 완료",
    image: "/progress/report.png",
  },
] as const;

function stepState(index: number, current: ValidationProgressStage): "done" | "active" | "pending" {
  if (current === 3) return "done";
  if (index < current) return "done";
  if (index === current) return "active";
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
  const lineProgress = current;
  const isComplete = current === 3;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const waitingCopy = isComplete
    ? "결과 화면에서 공개 페이지와 제작물을 확인해 보세요."
    : "작업이 끝나면 이 화면에서 바로 알려드릴게요.";

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className={`validation-progress-page page-container validation-stage-${current}`}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeStage.status}. {activeStage.title}
      </p>
      <div className="validation-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <section className="validation-progress-copy">
        <div key={current} className="validation-visual" aria-hidden="true">
          <span className="validation-visual-ring ring-one" />
          <span className="validation-visual-ring ring-two" />
          <span className="validation-spark spark-one" />
          <span className="validation-spark spark-two" />
          <Image
            className="validation-progress-illustration"
            src={activeStage.image}
            width={560}
            height={330}
            alt=""
            loading="eager"
            unoptimized
          />
        </div>
        <span className={`validation-live-status${isComplete ? " complete" : ""}`}>
          <i />
          {activeStage.status}
          {!isComplete ? (
            <span className="validation-waiting-dots" aria-hidden="true"><i /><i /><i /></span>
          ) : null}
        </span>
        <h1 ref={headingRef} tabIndex={-1}>{activeStage.title}</h1>
        <p>{activeStage.description}</p>
        <small>{waitingCopy}</small>
      </section>

      <section className="validation-stage-card">
        <header className="validation-stage-header">
          <div>
            <span>진행 상황</span>
            <strong>{isComplete ? "4단계 완료" : `${current + 1}/4 단계`}</strong>
          </div>
          <span className={`validation-eta${isComplete ? " ready" : ""}`}>
            {isComplete ? "준비가 끝났어요" : "안전하게 작업하고 있어요"}
          </span>
        </header>
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
        {isComplete ? (
          <Link className="button button-primary" href={reportHref}>준비된 결과 확인하기</Link>
        ) : (
          <Link className="progress-exit-link" href="/">메인으로 돌아가기</Link>
        )}
      </div>
    </main>
  );
}
