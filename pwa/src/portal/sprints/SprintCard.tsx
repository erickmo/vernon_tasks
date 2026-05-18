import { Link } from "react-router-dom";
import type { SprintRow } from "./api/types";

interface Props { row: SprintRow; }

export function SprintCard({ row }: Props) {
  const totalHours = row.open_hours + row.completed_hours;
  return (
    <Link to={row.name} className="sprint-card" data-sprint={row.name}>
      <div className="sprint-card__title">{row.sprint_title}</div>
      <div className="sprint-card__meta">{row.start_date} → {row.end_date}</div>
      <div className="sprint-card__stats">
        <span>{row.task_count} tasks</span>
        <span>{row.completed_hours} / {totalHours}h</span>
      </div>
    </Link>
  );
}
