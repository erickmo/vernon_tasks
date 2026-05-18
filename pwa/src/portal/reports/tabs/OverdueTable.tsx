import { useState } from "react";
import type { OverdueResponse } from "../api/types";
import { trackReportsOverdueViewToggle } from "../../../telemetry";

type ViewMode = "member" | "project";

interface Props {
  data: OverdueResponse;
}

export function OverdueTable({ data }: Props) {
  const [view, setView] = useState<ViewMode>("member");

  function switchView(v: ViewMode) {
    setView(v);
    trackReportsOverdueViewToggle(v);
  }

  return (
    <div className="overdue-table-wrapper">
      <div className="overdue-table-wrapper__controls">
        <button
          className={view === "member" ? "active" : ""}
          onClick={() => switchView("member")}
        >
          By Member
        </button>
        <button
          className={view === "project" ? "active" : ""}
          onClick={() => switchView("project")}
        >
          By Project
        </button>
      </div>
      {view === "member" ? (
        <table className="overdue-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Overdue Tasks</th>
              <th>Overdue Hours</th>
              <th>Oldest (days)</th>
            </tr>
          </thead>
          <tbody>
            {data.by_member.map((r) => {
              const cls =
                r.oldest_overdue_days > 7
                  ? "overdue-row--red"
                  : r.oldest_overdue_days >= 3
                  ? "overdue-row--amber"
                  : "";
              return (
                <tr key={r.user} className={cls}>
                  <td>{r.full_name}</td>
                  <td>{r.overdue_count}</td>
                  <td>{r.overdue_hours.toFixed(1)}</td>
                  <td>{r.oldest_overdue_days}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="overdue-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Overdue Tasks</th>
              <th>Overdue Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.by_project.map((r) => (
              <tr key={r.project}>
                <td>{r.project_title}</td>
                <td>{r.overdue_count}</td>
                <td>{r.overdue_hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
