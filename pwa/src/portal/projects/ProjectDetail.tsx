import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useProject } from "./hooks/useProject";
import { useProjectsBulk } from "./hooks/useProjectsBulk";
import { usePermissions } from "../../auth/usePermissions";
import { ObjectiveLink } from "./ObjectiveLink";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { PROJECT_STATUSES } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

export interface ProjectDetailProps { name: string | null }

export function ProjectDetail({ name }: ProjectDetailProps) {
  const query = useProject(name);
  const mut = useProjectsBulk();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("project.write");

  useEffect(() => {
    if (name && query.data) telemetry.trackProjectsDetailView(name);
  }, [name, query.data]);

  if (!name) return <EmptyState title="Select a Project" description="Pick a row to view details." />;
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <EmptyState title="Failed to load" description={String(query.error)} />;
  if (!query.data) return null;

  const p = query.data.project as Record<string, any>;
  const counts = query.data.counts;

  async function onStatusChange(next: string) {
    const from = String(p.status ?? "");
    telemetry.trackProjectsInlineStatusChange(name as string, from, next);
    await mut.mutateAsync({ names: [name as string], payload: { status: next as any } });
  }
  async function onAdvancePdca() {
    await mut.mutateAsync({ names: [name as string], payload: { pdca_phase: "__next__" } });
  }

  return (
    <article className="projects-detail">
      <header>
        <h2>{String(p.title ?? "")}</h2>
        <div className="projects-detail__meta">
          <span>Leader: {String(p.project_leader ?? "")}</span>
          <span>Owner: {String(p.project_owner ?? "")}</span>
          <span>Period: {String(p.start_date ?? "…")} — {String(p.end_date ?? "…")}</span>
          <span className="badge badge--status">{String(p.status ?? "")}</span>
          <span className="badge badge--pdca">{String(p.pdca_phase ?? "")}</span>
          <Link to={`/portal/projects/${encodeURIComponent(name)}/edit`}>Edit</Link>
        </div>
        {canWrite && (
          <div className="projects-detail__actions">
            <label>
              Status
              <select
                value={String(p.status ?? "")}
                onChange={(e) => onStatusChange(e.target.value)}
                disabled={mut.isPending}
              >
                {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <button type="button" onClick={onAdvancePdca} disabled={mut.isPending || p.pdca_phase === "CLOSED"}>
              Advance PDCA →
            </button>
          </div>
        )}
      </header>

      <ObjectiveLink projectName={name} objectiveName={(p.objective as string | null) ?? null} />

      <section className="projects-detail__counts">
        <div>Team: <strong>{counts.team_members}</strong></div>
        <div>Milestones: <strong>{counts.milestones}</strong></div>
        <div>Sprints: <strong>{counts.sprints}</strong></div>
        <div>Docs: <strong>{counts.documentation}</strong></div>
      </section>
    </article>
  );
}
