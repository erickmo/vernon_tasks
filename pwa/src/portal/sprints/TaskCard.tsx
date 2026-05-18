import type { TaskCardData } from "./api/types";

interface Props {
  task: TaskCardData;
  draggable: boolean;
  /** Called with task.name when the card is clicked. */
  onTaskOpen?: (taskName: string) => void;
}

export function TaskCard({ task, draggable, onTaskOpen }: Props) {
  const cls = ["task-card", `prio-${task.priority.toLowerCase()}`];
  if (!draggable) cls.push("task-card--muted");
  return (
    <div
      className={cls.join(" ")}
      data-task={task.name}
      onClick={() => onTaskOpen?.(task.name)}
      style={{ cursor: onTaskOpen ? "pointer" : "default" }}
    >
      <div className="task-card__title">{task.title}</div>
      <div className="task-card__meta">
        <span>{task.assigned_to ?? "—"}</span>
        <span>{task.estimated_hours}h</span>
      </div>
    </div>
  );
}
