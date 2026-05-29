/**
 * MobileTaskCard — presentational sprint task card for the mobile board.
 * Renders title, assignee, estimated hours and a priority class. The `pending`
 * modifier dims the card while an optimistic move is in flight.
 */
import type { TaskCardData } from "../../../portal/sprints/api/types";

interface Props {
  task: TaskCardData;
  pending?: boolean;
}

/** Render a single task card. @param task - card data @param pending - move in flight */
export function MobileTaskCard({ task, pending = false }: Props) {
  const cls = ["m-task-card", `prio-${task.priority.toLowerCase()}`];
  if (pending) cls.push("m-task-card--pending");
  return (
    <div
      data-testid={`mtask-${task.name}`}
      className={cls.join(" ")}
      style={{
        background: "var(--vt-card, #fff)",
        borderRadius: 10,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        padding: "10px 12px",
        marginBottom: 8,
        opacity: pending ? 0.6 : 1,
        touchAction: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: "currentColor" }} />
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{task.title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--vt-text-muted, #64748b)" }}>
        <span>{task.assigned_to ?? "—"}</span>
        <span>{task.estimated_hours}h</span>
      </div>
    </div>
  );
}
