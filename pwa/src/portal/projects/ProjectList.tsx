import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageLayout } from "../layouts/PageLayout";
import { FiltersBar } from "./FiltersBar";
import { ProjectTable } from "./ProjectTable";
import { ProjectDetail } from "./ProjectDetail";
import { BulkActions } from "./BulkActions";
import { useProjects } from "./hooks/useProjects";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import type { ListFilters } from "./api/types";

function filtersFromParams(p: URLSearchParams): ListFilters {
  const leader = p.get("leader");
  return {
    period_start: p.get("period_start") ?? undefined,
    period_end: p.get("period_end") ?? undefined,
    statuses: p.getAll("statuses"),
    pdca_phases: p.getAll("pdca"),
    leaders: leader ? [leader] : [],
    owners: [],
  };
}

export function ProjectList() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filters = filtersFromParams(params);
  const list = useProjects(filters);
  const activeName = params.get("proj");

  return (
    <PageLayout title="Projects" actions={<Link to="/portal/projects/new">+ New Project</Link>}>
      <FiltersBar />
      <BulkActions selected={selected} />
      <div className="projects-grid">
        <div className="projects-grid__list">
          {list.isLoading && <PageSkeleton />}
          {list.isError && <EmptyState title="Failed to load" description={String(list.error)} />}
          {list.data && list.data.length === 0 && (
            <EmptyState
              title="No Projects found"
              description="Adjust filters or create one."
              action={<Link to="/portal/projects/new">+ Create Project</Link>}
            />
          )}
          {list.data && list.data.length > 0 && (
            <ProjectTable rows={list.data} selected={selected} onSelectChange={setSelected} />
          )}
        </div>
        <aside className="projects-grid__detail">
          <ProjectDetail name={activeName} />
        </aside>
      </div>
    </PageLayout>
  );
}
