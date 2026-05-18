import type { TaskCardData } from "./api/types";

interface Props { task: TaskCardData; draggable: boolean; }

export function TaskCard({ task, draggable }: Props) {
  const cls = ["task-card", `prio-${task.priority.toLowerCase()}`];
  if (!draggable) cls.push("task-card--muted");
  return (
    <div className={cls.join(" ")} data-task={task.name}>
      <div className="task-card__title">{task.title}</div>
      <div className="task-card__meta">
        <span>{task.assigned_to ?? "—"}</span>
        <span>{task.estimated_hours}h</span>
      </div>
    </div>
  );
}
