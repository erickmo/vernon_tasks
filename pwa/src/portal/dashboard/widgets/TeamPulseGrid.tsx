import type { TeamMember } from "../api/portalDashboard";

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

const AV_COLORS = [
  "linear-gradient(135deg,#22c55e,#16a34a)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#a855f7,#7c3aed)",
  "linear-gradient(135deg,#0ea5e9,#0284c7)",
  "linear-gradient(135deg,#f43f5e,#e11d48)",
];

function initials(user: string): string {
  return user.split("@")[0].charAt(0).toUpperCase();
}

interface Props {
  members: TeamMember[];
  onHelp: (m: TeamMember) => void;
  onReview: (m: TeamMember) => void;
}

export function TeamPulseGrid({ members, onHelp, onReview }: Props) {
  if (members.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0", padding: "8px 0" }}>Semua anggota on track ✓</div>;
  }
  return (
    <div className="db-team-grid">
      {members.map((m, i) => (
        <div
          key={m.user}
          className={`db-member-card${m.status === "blocked" ? " db-member-card--blocked" : ""}`}
        >
          <div className="db-member-card__top">
            <div
              className="db-member-card__av"
              style={{ background: AV_COLORS[i % AV_COLORS.length] }}
            >
              {initials(m.user)}
            </div>
            <span className="db-member-card__name">{m.user.split("@")[0]}</span>
            <span className={`db-tag ${PDCA_CLASS[m.pdca_phase] ?? "db-tag--plan"}`}>
              {m.pdca_phase || "PLAN"}
            </span>
          </div>
          <div className="db-member-card__task">{m.task_title}</div>
          <div className="db-member-card__meta">
            {m.status === "blocked" && (
              <span className="db-tag db-tag--od">Blocked</span>
            )}
            {m.status === "overdue" && (
              <span className="db-tag db-tag--od">Overdue</span>
            )}
            {m.status === "blocked" && (
              <button className="db-btn-help" onClick={() => onHelp(m)}>Bantu</button>
            )}
            {m.kanban_status === "In Review" && (
              <button className="db-btn-review" onClick={() => onReview(m)}>Review</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
