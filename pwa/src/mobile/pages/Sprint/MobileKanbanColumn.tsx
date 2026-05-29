/**
 * MobileKanbanColumn — a droppable board column wrapping a SortableContext of
 * task cards. Drop target id convention is `tcol-<columnValue>` so the board's
 * drag-end handler can resolve the destination column from the over id.
 */
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MobileTaskCard } from "./MobileTaskCard";
import type { TaskCardData } from "../../../portal/sprints/api/types";

interface Props {
  column: string;
  tasks: TaskCardData[];
  pendingTaskId: string | null;
}

/** A sortable wrapper that wires dnd-kit drag handles onto a task card. */
function SortableCard({ task, pending }: { task: TaskCardData; pending: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.name });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MobileTaskCard task={task} pending={pending} />
    </div>
  );
}

/**
 * Render a board column with header (title + count) and its task cards.
 * @param column - column value (status or phase)
 * @param tasks - tasks already filtered + sorted for this column
 * @param pendingTaskId - id of a task currently mid-move, or null
 */
export function MobileKanbanColumn({ column, tasks, pendingTaskId }: Props) {
  const { setNodeRef } = useDroppable({ id: `tcol-${column}` });
  return (
    <div
      ref={setNodeRef}
      id={`tcol-${column}`}
      data-testid={`mcol-${column}`}
      style={{
        minWidth: "80vw",
        scrollSnapAlign: "start",
        background: "var(--vt-bg-subtle, #f1f5f9)",
        borderRadius: 12,
        padding: 10,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{column}</h4>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--vt-text-muted, #64748b)" }}>{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.name)} strategy={verticalListSortingStrategy}>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {tasks.map((t) => (
            <SortableCard key={t.name} task={t} pending={t.name === pendingTaskId} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
