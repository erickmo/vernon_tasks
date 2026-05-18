import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useObjective } from "./hooks/useObjective";
import { KRRow } from "./KRRow";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import * as telemetry from "../../telemetry";

export interface ObjectiveDetailProps {
  name: string | null;
}

export function ObjectiveDetail({ name }: ObjectiveDetailProps) {
  const query = useObjective(name);

  useEffect(() => {
    if (name && query.data) telemetry.trackOkrDetailView(name);
  }, [name, query.data]);

  if (!name)
    return (
      <EmptyState
        title="Select an Objective"
        description="Pick a row to view details."
      />
    );
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError)
    return <EmptyState title="Failed to load" description={String(query.error)} />;
  if (!query.data) return null;

  const o = query.data.objective as Record<string, unknown>;
  const krs = query.data.key_results;

  return (
    <article className="okr-detail">
      <header>
        <h2>{String(o.title ?? "")}</h2>
        <div className="okr-detail__meta">
          <span>Period: {String(o.period ?? "")}</span>
          <span>Owner: {String(o.objective_owner ?? "")}</span>
          <span>Status: {String(o.status ?? "")}</span>
          <span>PDCA: {String(o.pdca_phase ?? "")}</span>
          <Link to={`/portal/okr/${encodeURIComponent(name)}/edit`}>Edit</Link>
        </div>
      </header>
      {o.description ? <p>{String(o.description)}</p> : null}
      <section>
        <h3>Key Results</h3>
        {krs.length === 0 ? (
          <EmptyState
            title="No Key Results yet"
            description="Add one to track progress."
          />
        ) : (
          krs.map((kr) => <KRRow key={kr.name} kr={kr} objectiveName={name} />)
        )}
      </section>
    </article>
  );
}
