import { useState } from "react";
import type { OkrRollupRow, OkrRollupTotals } from "../api/types";

interface Props {
  rows: OkrRollupRow[];
  totals: OkrRollupTotals;
}

export function OkrRollupTable({ rows, totals }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  if (rows.length === 0) {
    return <div className="empty-state">No OKR data for this period.</div>;
  }

  const sorted = [...rows].sort((a, b) =>
    sortAsc ? a.avg_progress - b.avg_progress : b.avg_progress - a.avg_progress
  );

  return (
    <table className="okr-rollup-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Objectives</th>
          <th>KRs</th>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Avg Progress {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          <th>On Track</th>
          <th>At Risk</th>
          <th>Behind</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.project}>
            <td>{row.project_title}</td>
            <td>{row.objective_count}</td>
            <td>{row.kr_count}</td>
            <td>
              <div className="progress-cell">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.round(row.avg_progress * 100)}%` }}
                />
                <span>{Math.round(row.avg_progress * 100)}%</span>
              </div>
            </td>
            <td>{row.on_track}</td>
            <td>{row.at_risk}</td>
            <td>{row.behind}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{totals.objective_count}</td>
          <td>{totals.kr_count}</td>
          <td>{Math.round(totals.avg_progress * 100)}%</td>
          <td>{totals.on_track}</td>
          <td>{totals.at_risk}</td>
          <td>{totals.behind}</td>
        </tr>
      </tfoot>
    </table>
  );
}
