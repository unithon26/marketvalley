"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { PlusIcon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";

const projects = [
  { id: "closing-bite", name: "마감한입", time: "검증 완료", progress: 100, group: "completed", tone: "violet", image: "/projects/completed.png", href: "/campaigns/demo" },
  { id: "workshop", name: "동네공방 빈자리", time: "8시간 남음", progress: 64, group: "ongoing", tone: "lavender", image: "/progress/creative.png", href: null },
  { id: "class-inquiry", name: "클래스 문의함", time: "14시간 남음", progress: 36, group: "ongoing", tone: "blue", image: "/progress/collection.png", href: null },
  { id: "closing-notice", name: "카페 마감 알림", time: "6시간 남음", progress: 72, group: "ongoing", tone: "mint", image: "/progress/review.png", href: null },
  { id: "vacancy-notice", name: "공방 빈자리 알림", time: "21시간 남음", progress: 48, group: "ongoing", tone: "peach", image: "/progress/creative.png", href: null },
  { id: "class-reservation", name: "클래스 예약 알림", time: "12시간 남음", progress: 55, group: "ongoing", tone: "yellow", image: "/progress/collection.png", href: null },
] as const;

type ProjectGroup = typeof projects[number]["group"];

export default function HomePage() {
  const [activeGroup, setActiveGroup] = useState<ProjectGroup>("ongoing");
  const visibleProjects = projects.filter((project) => project.group === activeGroup);

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <main className="dashboard page-container">
        <div className="dashboard-heading">
          <h1>전체 프로젝트</h1>
        </div>
        <div className="dashboard-toolbar">
          <div className="segment-control" aria-label="프로젝트 상태 필터">
            <button className={activeGroup === "ongoing" ? "active" : ""} type="button" aria-pressed={activeGroup === "ongoing"} onClick={() => setActiveGroup("ongoing")}>진행 중</button>
            <button className={activeGroup === "completed" ? "active" : ""} type="button" aria-pressed={activeGroup === "completed"} onClick={() => setActiveGroup("completed")}>검증 완료</button>
          </div>
          <CampaignEntryLink className="button button-primary"><PlusIcon size={20} /> 광고 만들기</CampaignEntryLink>
        </div>
        <section className="project-grid" aria-label="프로젝트 목록">
          {visibleProjects.map((project) => {
            const card = (
              <>
                <div className={`project-visual ${project.tone}`}>
                  <Image src={project.image} width={560} height={330} alt="" unoptimized />
                </div>
                <div className="project-card-body">
                  <strong>{project.name}</strong>
                  <span className="time-chip">{project.time}</span>
                  <div className="progress-meta"><b>{project.progress}%</b></div>
                  <div className="progress-track"><i style={{ width: `${project.progress}%` }} /></div>
                </div>
              </>
            );

            return project.href
              ? <Link href={project.href} className="project-card" key={project.id}>{card}</Link>
              : <article className="project-card project-card-disabled" key={project.id} aria-label={`${project.name}, 발표 범위 밖 목 프로젝트`}>{card}</article>;
          })}
        </section>
      </main>
    </div>
  );
}
