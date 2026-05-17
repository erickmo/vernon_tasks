import { Link } from "react-router-dom";
import { useObjective } from "../okr/hooks/useObjective";

export interface ObjectiveLinkProps {
  projectName: string;
  objectiveName: string | null;
}

export function ObjectiveLink({ projectName, objectiveName }: ObjectiveLinkProps) {
  const query = useObjective(objectiveName);
  if (!objectiveName) return null;

  if (query.isLoading) {
    return <div data-testid="objective-link-skeleton" className="objective-link__skeleton">Loading linked OKR…</div>;
  }
  if (query.isError) {
    return <p className="objective-link__error">(linked OKR not found)</p>;
  }
  if (!query.data) return null;

  const o = query.data.objective as Record<string, any>;
  const krs = query.data.key_results;
  const avg = krs.length === 0 ? 0 : Math.round(krs.reduce((s, k) => s + k.progress_percent, 0) / krs.length);

  return (
    <Link
      to={`/portal/okr?obj=${encodeURIComponent(objectiveName)}`}
      className="objective-link"
      data-project={projectName}
    >
      <div className="objective-link__card">
        <strong>{String(o.title ?? "")}</strong>
        <span>{String(o.period ?? "")}</span>
        <span>{String(o.status ?? "")}</span>
        <progress max={100} value={avg} />
        <span>{avg}%</span>
      </div>
    </Link>
  );
}
