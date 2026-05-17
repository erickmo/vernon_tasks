import { Link, useSearchParams } from "react-router-dom";
import type { ProjectRow } from "./api/types";

export interface ProjectTableProps {
  rows: ProjectRow[];
  selected: Set<string>;
  onSelectChange: (next: Set<string>) => void;
}

export function ProjectTable({ rows, selected, onSelectChange }: ProjectTableProps) {
  const [params, setParams] = useSearchParams();
  const activeName = params.get("proj");

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectChange(next);
  }

  function selectRow(name: string) {
    const next = new URLSearchParams(params);
    next.set("proj", name);
    setParams(next, { replace: true });
  }

  function periodLabel(r: ProjectRow): string {
    if (!r.start_date && !r.end_date) return "—";
    return `${r.start_date ?? "…"} — ${r.end_date ?? "…"}`;
  }

  return (
    <table className="projects-table">
      <thead>
        <tr>
          <th>
            <input type="checkbox" aria-label="select all"
              checked={rows.length > 0 && rows.every((r) => selected.has(r.name))}
              onChange={() =>
                onSelectChange(rows.every((r) => selected.has(r.name)) ? new Set() : new Set(rows.map((r) => r.name)))
              } />
          </th>
          <th>Title</th><th>Leader</th><th>Owner</th><th>Period</th><th>Status</th><th>PDCA</th><th>Linked OKR</th><th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} aria-current={activeName === r.name ? "true" : undefined}
              onClick={() => selectRow(r.name)} style={{ cursor: "pointer" }}>
            <td onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" aria-label={`select project ${r.title}`}
                checked={selected.has(r.name)} onChange={() => toggle(r.name)} />
            </td>
            <td><Link to={`?proj=${encodeURIComponent(r.name)}`} onClick={(e) => e.stopPropagation()}>{r.title}</Link></td>
            <td>{r.project_leader}</td>
            <td>{r.project_owner}</td>
            <td>{periodLabel(r)}</td>
            <td>{r.status}</td>
            <td>{r.pdca_phase}</td>
            <td>{r.linked_objective_title ?? "—"}</td>
            <td>{r.modified.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
