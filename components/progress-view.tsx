"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ChartIcon } from "@/components/icons";

const stages = ["접수", "준비 중", "수집 중", "결과 도착"];
const stageTitles = [
  "광고 검증 요청이 접수되었습니다",
  "카드뉴스와 랜딩페이지를 제작하고 있습니다",
  "카드뉴스와 랜딩페이지 제작을 완료했어요",
  "시장 데이터 수집이 완료되었습니다",
];
const stageDescriptions = [
  "입력한 내용을 확인한 뒤 광고 제작을 시작합니다.",
  "검토한 내용을 바탕으로 두 광고 결과물을 함께 만들고 있습니다.",
  "제작된 광고를 통해 시장 데이터를 수집하고 있습니다.",
  "수집된 결과를 확인할 수 있는 리포트가 도착했습니다.",
];

export function ProgressView({ campaignId }: { campaignId: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timers = [1, 2, 3].map((stage) => window.setTimeout(() => setCurrent(stage), stage * 700));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <main className="progress-page page-container">
      <div className="progress-heading-row">
        <div><span className="eyebrow">VALIDATION IN PROGRESS</span><h1>광고 검증을 준비하고 있습니다</h1></div>
        <div className="eta-card"><span>결과 제공까지</span><strong>{current === 3 ? "완료" : "약 2일"}</strong></div>
      </div>

      <ol className="stage-line" aria-label="광고 검증 진행 상황">
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
        <h2>{stageTitles[current]}</h2>
        <p>{stageDescriptions[current]}</p>
      </section>

      <div className="progress-actions">
        {current === 3 ? (
          <Link className="button button-primary" href={`/campaigns/${campaignId}`}><ChartIcon size={18} /> 검증 리포트 확인하기</Link>
        ) : (
          <button className="button button-disabled" type="button" disabled>광고 구성 중</button>
        )}
      </div>
    </main>
  );
}
