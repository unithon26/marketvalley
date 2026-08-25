"use client";

import Link from "next/link";
import { useState } from "react";
import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { CardFlowIcon, PlusIcon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";

const projects = [
  { name: "마감한입", time: "데모 준비 완료", progress: 100, state: "검증 중", group: "ongoing", tone: "violet", href: "/campaigns/demo" },
  { name: "동네공방 빈자리", time: "목데이터", progress: 64, state: "준비 중", group: "ongoing", tone: "blue", href: null },
  { name: "클래스 문의함", time: "목데이터", progress: 36, state: "준비 중", group: "ongoing", tone: "mint", href: null },
] as const;

type ProjectGroup = typeof projects[number]["group"] | "completed";

export default function HomePage() {
  const [activeGroup, setActiveGroup] = useState<ProjectGroup>("ongoing");
  const visibleProjects = projects.filter((project) => project.group === activeGroup);

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="dashboard page-container">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">MARKET VALIDATION WORKSPACE</span>
            <h1>전체 프로젝트</h1>
            <p>아이디어에서 첫 시장 반응까지, 반복 제작 없이 한 흐름으로 관리하세요.</p>
          </div>
          <CampaignEntryLink className="button button-primary"><PlusIcon size={18} /> 새 광고</CampaignEntryLink>
        </div>

        <div className="segment-control" aria-label="프로젝트 상태 필터">
          <button className={activeGroup === "ongoing" ? "active" : ""} type="button" aria-pressed={activeGroup === "ongoing"} onClick={() => setActiveGroup("ongoing")}>진행 중 <span>3</span></button>
          <button className={activeGroup === "completed" ? "active" : ""} type="button" aria-pressed={activeGroup === "completed"} onClick={() => setActiveGroup("completed")}>검증 완료 <span>0</span></button>
        </div>

        <section className="project-grid" aria-label="프로젝트 목록">
          {visibleProjects.map((project) => {
            const card = <>
              <div className={`project-visual ${project.tone}`}>
                <span className="visual-pill">{project.state}</span>
                <div className="visual-flow"><CardFlowIcon size={22} /></div>
              </div>
              <div className="project-card-body">
                <strong>{project.name}</strong>
                <span className="time-chip">{project.time}</span>
                <div className="progress-meta"><span>광고 준비도</span><b>{project.progress}%</b></div>
                <div className="progress-track"><i style={{ width: `${project.progress}%` }} /></div>
              </div>
            </>;

            return project.href ? (
              <Link href={project.href} className="project-card" key={project.name}>{card}</Link>
            ) : (
              <article className="project-card project-card-disabled" key={project.name} aria-label={`${project.name}, 발표 범위 밖 목 프로젝트`}>{card}</article>
            );
          })}
          {activeGroup === "ongoing" ? (
            <CampaignEntryLink className="new-project-card">
              <span className="new-project-icon"><PlusIcon size={28} /></span>
              <strong>새 아이디어 검증하기</strong>
              <p>광고 제작에 필요한 반복 작업을 없애보세요.</p>
            </CampaignEntryLink>
          ) : (
            <div className="empty-projects" role="status">
              <strong>완료된 검증이 아직 없어요.</strong>
              <p>충분한 실제 신호를 확인하고 사람이 검증을 마치면 이곳에 표시됩니다.</p>
              <button type="button" onClick={() => setActiveGroup("ongoing")}>진행 중 프로젝트 보기</button>
            </div>
          )}
        </section>

        <section className="disappear-panel">
          <div><span className="eyebrow">BEFORE</span><strong>기획 → 재작성 → 조판 → 배포 → 취합</strong></div>
          <span className="flow-arrow">→</span>
          <div><span className="eyebrow accent-text">AFTER</span><strong>아이디어 → 사람의 판단</strong></div>
          <p>사라진 일은 속도가 아니라 단계로 보여드립니다.</p>
        </section>
      </main>
    </div>
  );
}
