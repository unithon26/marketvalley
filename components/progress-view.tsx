"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ChartIcon } from "@/components/icons";

const stages = ["접수", "준비 중", "수집 중", "결과 도착"];

export function ProgressView() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timers = [1, 2, 3].map((stage) => window.setTimeout(() => setCurrent(stage), stage * 700));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <main className="progress-page page-container">
      <div className="progress-heading-row">
        <div><span className="eyebrow">DETERMINISTIC DEMO</span><h1>시장검증 캠페인을 준비하고 있어요</h1></div>
        <div className="eta-card"><span>결과 제공까지</span><strong>{current === 3 ? "완료" : "약 2분"}</strong></div>
      </div>

      <ol className="stage-line" aria-label="캠페인 생성 진행 상황">
        {stages.map((stage, index) => (
          <li key={stage} className={index <= current ? "done" : ""}>
            <span>{index <= current ? <CheckIcon size={16} /> : index + 1}</span>
            <b>{stage}</b>
          </li>
        ))}
      </ol>

      <section className="processing-visual" aria-live="polite">
        <div className={`processing-orb stage-${current}`}><i /><i /><i /></div>
        <span className="processing-status">{stages[current]}</span>
        <h2>{current === 3 ? "랜딩·캐러셀·게시 준비가 끝났어요" : "같은 가설로 모든 결과물을 맞추고 있어요"}</h2>
        <p>{current === 3 ? "실제 외부 API 없이 동일한 fixture와 렌더러로 완성했습니다." : "잠시만 기다려주세요. 이 화면은 발표용 결정적 시뮬레이션입니다."}</p>
      </section>

      <div className="progress-actions">
        {current === 3 ? (
          <Link className="button button-primary" href="/campaigns/demo"><ChartIcon size={18} /> 검증 리포트 확인하기</Link>
        ) : (
          <button className="button button-disabled" type="button" disabled>캠페인 구성 중</button>
        )}
      </div>
    </main>
  );
}
