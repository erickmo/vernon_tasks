import { Link, useSearchParams } from "react-router-dom";
import type { ObjectiveRow } from "./api/types";

export interface ObjectiveTableProps {
  rows: ObjectiveRow[];
  selected: Set<string>;
  onSelectChange: (next: Set<string>) => void;
}

export function ObjectiveTable({ rows, selected, onSelectChange }: ObjectiveTableProps) {
  const [params, setParams] = useSearchParams();
  const activeName = params.get("obj");

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectChange(next);
  }

  function selectRow(name: string) {
    const next = new URLSearchParams(params);
    next.set("obj", name);
    setParams(next, { replace: true });
  }

  return (
    <table className="okr-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="select all"
              checked={rows.length > 0 && rows.every((r) => selected.has(r.name))}
              onChange={() =>
                onSelectChange(
                  rows.every((r) => selected.has(r.name))
                    ? new Set()
                    : new Set(rows.map((r) => r.name)),
                )
              }
            />
          </th>
          <th>Title</th>
          <th>Period</th>
          <th>Owner</th>
          <th>Status</th>
          <th>PDCA</th>
          <th>Progress</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.name}
            aria-current={activeName === r.name ? "true" : undefined}
            onClick={() => selectRow(r.name)}
            style={{ cursor: "pointer" }}
          >
            <td onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`select objective ${r.title}`}
                checked={selected.has(r.name)}
                onChange={() => toggle(r.name)}
              />
            </td>
            <td>
              <Link
                to={`?obj=${encodeURIComponent(r.name)}`}
                onClick={(e) => e.stopPropagation()}
              >
                {r.title}
              </Link>
            </td>
            <td>{r.period}</td>
            <td>{r.objective_owner}</td>
            <td>{r.status}</td>
            <td>{r.pdca_phase}</td>
            <td>{Math.round(r.progress_avg)}%</td>
            <td>{r.modified.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
