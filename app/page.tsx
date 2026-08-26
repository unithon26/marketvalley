"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";
import { hasBundledAuthMode } from "@/lib/auth/mode";
import { useAuthSession } from "@/lib/client/use-auth-session";
import type { CampaignLifecycleResponse } from "@/lib/contracts/api";
import { isMetaOperationQuotaErrorCode } from "@/lib/lifecycle/metaOperationQuotaRetry";

type ProjectGroup = "ongoing" | "completed";

const statusCopy: Record<CampaignLifecycleResponse["status"], string> = {
  SUBMITTED: "접수 완료",
  GENERATING: "AI 문구 생성 중",
  PREPARING: "광고 제작 중",
  AWAITING_ACTIVATION: "실제 게재 확인 중",
  COLLECTING: "실제 반응 수집 중",
  FINALIZING: "최종 집계 중",
  COMPLETED: "결과 도착",
  RETRY_WAIT: "자동 재시도 중",
  FAILED: "확인 필요",
  ARCHIVED: "이전 프로젝트",
};

const statusProgress: Record<CampaignLifecycleResponse["status"], number> = {
  SUBMITTED: 10,
  GENERATING: 25,
  PREPARING: 45,
  AWAITING_ACTIVATION: 60,
  COLLECTING: 75,
  FINALIZING: 90,
  COMPLETED: 100,
  RETRY_WAIT: 45,
  FAILED: 45,
  ARCHIVED: 100,
};

const statusImage: Record<CampaignLifecycleResponse["status"], string> = {
  SUBMITTED: "/progress/review.png",
  GENERATING: "/progress/creative.png",
  PREPARING: "/progress/creative.png",
  AWAITING_ACTIVATION: "/progress/creative.png",
  COLLECTING: "/progress/collection.png",
  FINALIZING: "/progress/report.png",
  COMPLETED: "/progress/report.png",
  RETRY_WAIT: "/progress/creative.png",
  FAILED: "/progress/review.png",
  ARCHIVED: "/progress/report.png",
};

export default function HomePage() {
  const authEnabled = hasBundledAuthMode();
  const { state: authState } = useAuthSession(authEnabled);
  const [activeGroup, setActiveGroup] = useState<ProjectGroup>("ongoing");
  const [projects, setProjects] = useState<CampaignLifecycleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/campaigns/lifecycle", { cache: "no-store" });
      if (!response.ok) throw new Error("campaign_list_failed");
      const body = await response.json() as { campaigns?: unknown };
      if (!Array.isArray(body.campaigns)) throw new Error("campaign_list_invalid");
      setProjects(body.campaigns as CampaignLifecycleResponse[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteProject = useCallback(async (
    project: CampaignLifecycleResponse,
    name: string,
  ) => {
    const confirmed = window.confirm(
      `“${name}” 프로젝트와 예약자 데이터를 삭제할까요? 삭제한 데이터는 복구할 수 없습니다.`,
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingIds((current) => new Set(current).add(project.id));
    try {
      const query = new URLSearchParams({ id: project.id, draftId: project.draftId });
      const response = await fetch(`/api/campaigns?${query.toString()}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const body = await response.json() as { error?: { message?: unknown } };
      if (!response.ok) {
        throw new Error(
          typeof body.error?.message === "string"
            ? body.error.message
            : "프로젝트를 삭제하지 못했습니다.",
        );
      }
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다.");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const canLoad = !authEnabled || authState.status === "authenticated";
    if (!canLoad) return;
    const frame = window.requestAnimationFrame(() => { void loadProjects(); });
    return () => window.cancelAnimationFrame(frame);
  }, [authEnabled, authState.status, loadProjects]);

  const visibleProjects = useMemo(() => {
    const accountProjects = !authEnabled || authState.status === "authenticated" ? projects : [];
    return accountProjects.filter((project) => (
      activeGroup === "completed"
        ? project.status === "COMPLETED" || project.status === "ARCHIVED"
        : project.status !== "COMPLETED" && project.status !== "ARCHIVED"
    ));
  }, [activeGroup, authEnabled, authState.status, projects]);
  const anonymous = authEnabled && authState.status === "anonymous";

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

        {loading ? <p className="project-empty" role="status">내 프로젝트를 불러오고 있어요.</p> : null}
        {!loading && loadError ? (
          <div className="project-empty" role="alert">
            <p>프로젝트를 불러오지 못했어요.</p>
            <button className="text-button" type="button" onClick={() => void loadProjects()}>다시 불러오기</button>
          </div>
        ) : null}
        {deleteError ? <p className="dashboard-error" role="alert">{deleteError}</p> : null}
        {!loading && !loadError && visibleProjects.length === 0 ? (
          <div className="project-empty">
            <p>{anonymous
              ? "Google로 로그인하면 이 계정의 진행 상황을 이어서 볼 수 있어요."
              : activeGroup === "ongoing"
                ? "진행 중인 시장검증 광고가 없습니다."
                : "완료된 시장검증 리포트가 없습니다."}</p>
          </div>
        ) : null}

        <section className="project-grid" aria-label="프로젝트 목록">
          {visibleProjects.map((project) => {
            const completed = project.status === "COMPLETED" || project.status === "ARCHIVED";
            const href = project.status === "COMPLETED"
              ? `/campaigns/${encodeURIComponent(project.id)}`
              : `/campaigns/${encodeURIComponent(project.id)}/progress`;
            const name = project.spec?.project.name ?? "시장검증 광고 준비 중";
            const image = project.spec
              ? `/api/campaigns/${encodeURIComponent(project.id)}/cards/1`
              : statusImage[project.status];
            const deleting = deletingIds.has(project.id);
            return (
              <article className="project-card-shell" key={project.id}>
                <Link href={href} className="project-card">
                  <div className="project-visual">
                    <Image src={image} width={560} height={330} alt="" unoptimized />
                  </div>
                  <div className="project-card-body">
                    <strong>{name}</strong>
                    <span className="time-chip">{
                      project.status === "RETRY_WAIT"
                        && isMetaOperationQuotaErrorCode(project.lastErrorCode)
                        ? "광고 생성 한도 초기화 대기"
                        : statusCopy[project.status]
                    }</span>
                    <div className="progress-meta"><b>{statusProgress[project.status]}%</b></div>
                    <div className="progress-track"><i style={{ width: `${statusProgress[project.status]}%` }} /></div>
                    {(project.status === "FAILED" || project.status === "RETRY_WAIT")
                      && project.lastErrorMessage ? (
                      <small className="project-error">{project.lastErrorMessage}</small>
                    ) : null}
                    {completed && project.status === "ARCHIVED" ? (
                      <small className="project-archive-note">새 자동 수집 이전에 만든 프로젝트입니다.</small>
                    ) : null}
                  </div>
                </Link>
                <button
                  className="project-delete-button"
                  type="button"
                  aria-label={`${name} 프로젝트 삭제`}
                  disabled={deleting}
                  onClick={() => void deleteProject(project, name)}
                >
                  <TrashIcon size={18} />
                  <span>{deleting ? "삭제 중" : "삭제"}</span>
                </button>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
