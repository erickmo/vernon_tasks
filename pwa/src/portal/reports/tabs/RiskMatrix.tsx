import { useState } from "react";
import type { RiskProject, RiskLevel } from "../api/types";

const RISK_TYPES = [
  "overdue_tasks",
  "velocity_drop",
  "no_active_sprint",
];

const RISK_TYPE_LABEL: Record<string, string> = {
  overdue_tasks:    "Overdue Tasks",
  velocity_drop:    "Velocity Drop",
  no_active_sprint: "No Active Sprint",
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
  high: 3, medium: 2, low: 1, none: 0,
};

interface Props {
  risks: RiskProject[];
}

export function RiskMatrix({ risks }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  const allNone = risks.every((r) => r.max_level === "none");
  if (allNone) {
    return (
      <div className="empty-state empty-state--check">
        <span>No risks flagged</span>
      </div>
    );
  }

  const sorted = [...risks].sort((a, b) =>
    sortAsc
      ? LEVEL_ORDER[a.max_level] - LEVEL_ORDER[b.max_level]
      : LEVEL_ORDER[b.max_level] - LEVEL_ORDER[a.max_level]
  );

  return (
    <table className="risk-matrix">
      <thead>
        <tr>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Project {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          {RISK_TYPES.map((rt) => (
            <th key={rt}>{RISK_TYPE_LABEL[rt] ?? rt}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((rp) => (
          <tr key={rp.project}>
            <td>{rp.project_title}</td>
            {RISK_TYPES.map((rt) => {
              const flag = rp.flags.find((f) => f.type === rt);
              const level = flag?.level ?? "none";
              return (
                <td key={rt}>
                  {level !== "none" && (
                    <span
                      className={`risk-badge risk-badge--${level}`}
                      aria-label={`severity: ${level}`}
                    >
                      {level}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
