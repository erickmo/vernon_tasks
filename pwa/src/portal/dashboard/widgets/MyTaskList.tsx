export interface MyTask {
  name: string;
  title: string;
  pdca_phase: string;
  kanban_status: string;
  deadline?: string;
}

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

interface Props {
  tasks: MyTask[];
  onClickMore: () => void;
}

export function MyTaskList({ tasks, onClickMore }: Props) {
  const visible = tasks.slice(0, 5);
  const rest = tasks.length - 5;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      {visible.map((t) => {
        const done = t.kanban_status === "Done";
        const overdue = !done && t.deadline && t.deadline < today;
        return (
          <div
            key={t.name}
            className={`db-task-row${overdue ? " db-task-row--urgent" : ""}${done ? " db-task-row--done" : ""}`}
          >
            <div className={`db-task-check${done ? " db-task-check--done" : " db-task-check--active"}`}>
              {done && "✓"}
            </div>
            <span className={`db-task-text${done ? " db-task-text--done" : ""}`}>{t.title}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {overdue && <span className="db-tag db-tag--od">Overdue</span>}
              <span className={`db-tag ${PDCA_CLASS[t.pdca_phase] ?? "db-tag--plan"}`}>
                {t.pdca_phase || "PLAN"}
              </span>
            </div>
          </div>
        );
      })}
      {rest > 0 && (
        <div className="db-task-more" onClick={onClickMore}>+{rest} task lainnya →</div>
      )}
    </div>
  );
}
