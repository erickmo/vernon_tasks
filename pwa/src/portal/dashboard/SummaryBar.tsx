import type { DashboardSummary } from "./api/portalDashboard";

interface Props {
  summary: DashboardSummary;
  isLeader: boolean;
}

export function SummaryBar({ summary, isLeader }: Props) {
  return (
    <div className="db-summary">
      {isLeader && (
        <>
          <div className="db-stat">
            <div className="db-stat__label">Team Blocked</div>
            <div className={`db-stat__value${summary.team_blocked > 0 ? " db-stat__value--bad" : ""}`}>
              {summary.team_blocked}
            </div>
            <div className="db-stat__sub">perlu tindakan segera</div>
          </div>
          <div className="db-stat">
            <div className="db-stat__label">Unassigned</div>
            <div className={`db-stat__value${summary.unassigned_tasks > 0 ? " db-stat__value--warn" : ""}`}>
              {summary.unassigned_tasks}
            </div>
            <div className="db-stat__sub">task belum didelegasi</div>
          </div>
        </>
      )}
      <div className="db-stat">
        <div className="db-stat__label">OKR Org</div>
        <div className="db-stat__value db-stat__value--grad">{summary.okr_progress}%</div>
        <div className="db-stat__sub">progress keseluruhan</div>
      </div>
      <div className="db-stat">
        <div className="db-stat__label">Overdue Saya</div>
        <div className={`db-stat__value${summary.my_overdue > 0 ? " db-stat__value--bad" : " db-stat__value--good"}`}>
          {summary.my_overdue}
        </div>
        <div className="db-stat__sub">task perlu diselesaikan</div>
      </div>
      <div className="db-stat">
        <div className="db-stat__label">Sprint</div>
        <div className={`db-stat__value${summary.sprint_days_remaining <= 2 ? " db-stat__value--warn" : ""}`}>
          {summary.sprint_days_remaining}
        </div>
        <div className="db-stat__sub">hari tersisa</div>
      </div>
    </div>
  );
}
