import { type HTMLAttributes } from "react";
import { useMyTasksTimeline } from "../hooks/useMyTasksTimeline";
import { MyTaskList } from "../widgets/MyTaskList";
import { TaskTimeline } from "../widgets/TaskTimeline";
import type { MyTask } from "../widgets/MyTaskList";
import { useNavigate } from "react-router-dom";

interface Props {
  tasks: MyTask[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}

export function MemberSection({ tasks, collapsed, onToggleCollapse, dragHandleProps }: Props) {
  const timeline = useMyTasksTimeline(3, 3);
  const navigate = useNavigate();
  const overdueCount = tasks.filter((t) => {
    const today = new Date().toISOString().split("T")[0];
    return t.kanban_status !== "Done" && t.deadline && t.deadline < today;
  }).length;

  return (
    <>
      <div className="db-section__strip db-section__strip--member" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">⚡</span>
        <div>
          <div className="db-section__title">As Project Member</div>
          <div className="db-section__subtitle">Task saya — kerjakan setelah tim & portfolio aman</div>
        </div>
        <div className="db-section__badges">
          {overdueCount > 0 && (
            <span className="db-badge db-badge--red">{overdueCount} Overdue</span>
          )}
          <span className="db-badge db-badge--green">{tasks.length} Tasks</span>
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-member-layout">
          <div>
            <div className="db-sub-label">📋 My Tasks</div>
            <MyTaskList
              tasks={tasks}
              onClickMore={() => navigate("/portal/projects")}
            />
          </div>
          <div>
            <div className="db-sub-label">📅 Timeline 7 Hari</div>
            {timeline.isLoading ? (
              <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
            ) : (
              <TaskTimeline data={timeline.data ?? {}} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
