import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageLayout } from "../layouts/PageLayout";
import { FiltersBar } from "./FiltersBar";
import { ObjectiveTable } from "./ObjectiveTable";
import { ObjectiveDetail } from "./ObjectiveDetail";
import { BulkActions } from "./BulkActions";
import { useObjectives } from "./hooks/useObjectives";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import type { ListFilters } from "./api/types";

function filtersFromParams(p: URLSearchParams): ListFilters {
  return {
    period_start: p.get("period_start") ?? undefined,
    period_end: p.get("period_end") ?? undefined,
    owners: p.getAll("owner"),
    statuses: p.getAll("statuses"),
    pdca_phases: p.getAll("pdca"),
  };
}

export function OKRList() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filters = filtersFromParams(params);
  const list = useObjectives(filters);
  const activeName = params.get("obj");

  return (
    <PageLayout title="OKR" actions={<Link to="/portal/okr/new">+ New Objective</Link>}>
      <FiltersBar />
      <BulkActions selected={selected} />
      <div className="okr-grid">
        <div className="okr-grid__list">
          {list.isLoading && <PageSkeleton />}
          {list.isError && <EmptyState title="Failed to load" description={String(list.error)} />}
          {list.data && list.data.length === 0 && (
            <EmptyState title="No Objectives found" description="Adjust filters or create one." action={<Link to="/portal/okr/new">+ Create Objective</Link>} />
          )}
          {list.data && list.data.length > 0 && (
            <ObjectiveTable rows={list.data} selected={selected} onSelectChange={setSelected} />
          )}
        </div>
        <aside className="okr-grid__detail">
          <ObjectiveDetail name={activeName} />
        </aside>
      </div>
    </PageLayout>
  );
}
