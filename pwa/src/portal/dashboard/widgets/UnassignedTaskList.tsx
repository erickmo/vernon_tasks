import type { UnassignedTask } from "../api/portalDashboard";

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

interface Props {
  tasks: UnassignedTask[];
  onAssign: (task: UnassignedTask) => void;
}

export function UnassignedTaskList({ tasks, onAssign }: Props) {
  if (tasks.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0", padding: "8px 0" }}>Semua task sudah ter-assign ✓</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {tasks.map((t) => (
        <div key={t.name} className="db-unassigned-row">
          <span className={`db-tag ${PDCA_CLASS[t.pdca_phase] ?? "db-tag--plan"}`}>
            {t.pdca_phase || "PLAN"}
          </span>
          <span className="db-unassigned-row__text">{t.title}</span>
          {t.sprint && <span style={{ fontSize: 10, color: "#6b63a0" }}>{t.sprint}</span>}
          <button className="db-btn-assign" onClick={() => onAssign(t)}>Assign</button>
        </div>
      ))}
    </div>
  );
}
