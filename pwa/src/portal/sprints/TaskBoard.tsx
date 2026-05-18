import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./TaskCard";
import { useTaskBoard } from "./hooks/useTaskBoard";
import type { SprintDetail, TaskCardData, BoardAxis, KanbanStatus, PdcaPhase } from "./api/types";
import * as telemetry from "../../telemetry";
import { TaskDetailPanel } from "../tasks/TaskDetailPanel";
import { TaskCreateModal } from "../tasks/TaskCreateModal";

const KANBAN_COLS: KanbanStatus[] = ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"];
const PDCA_COLS: PdcaPhase[] = ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"];

interface Props {
  detail: SprintDetail;
  currentUser: string;
  canEditAll: boolean;
  userRole?: "Manager" | "Leader" | "Member" | null;
  projectMembers?: { email: string; full_name: string }[];
}

interface DraggableProps {
  task: TaskCardData;
  draggable: boolean;
  onTaskOpen: (taskName: string) => void;
}

function Draggable({ task, draggable, onTaskOpen }: DraggableProps) {
  const sortable = useSortable({ id: task.name, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <div ref={sortable.setNodeRef} style={style}
         {...(draggable ? sortable.attributes : {})} {...(draggable ? sortable.listeners : {})}>
      <TaskCard task={task} draggable={draggable} onTaskOpen={onTaskOpen} />
    </div>
  );
}

export function TaskBoard({ detail, currentUser, canEditAll, userRole = null, projectMembers = [] }: Props) {
  const [axis, setAxis] = useState<BoardAxis>("kanban_status");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const cols: readonly string[] = axis === "kanban_status" ? KANBAN_COLS : PDCA_COLS;
  const { move } = useTaskBoard(detail.sprint.name);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** Manager/Leader can always create; Member only when sprint is Active. */
  const canCreate =
    userRole === "Manager" ||
    userRole === "Leader" ||
    (userRole === "Member" && detail.sprint.status === "Active");

  function canDrag(t: TaskCardData) { return canEditAll || t.assigned_to === currentUser; }

  function onDragEnd(ev: DragEndEvent) {
    const taskId = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId) return;
    const targetCol = cols.find(c => overId === `tcol-${c}`)
      ?? (detail.tasks.find(t => t.name === overId)?.[axis] as string | undefined);
    if (!targetCol) return;
    const task = detail.tasks.find(t => t.name === taskId);
    if (!task) return;
    const colTasks = detail.tasks.filter(t => t[axis] === targetCol && t.name !== taskId)
      .sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
    const lastRank = colTasks.length ? colTasks[colTasks.length - 1].kanban_rank : null;
    move.mutate({ task: taskId, axis, targetColumn: targetCol, prevRank: lastRank, nextRank: null });
    telemetry.trackTaskMove(taskId, detail.sprint.name,
      axis === "kanban_status" ? "kanban" : "pdca", task[axis] as string, targetCol);
  }

  return (
    <div>
      <div className="task-board__toolbar">
        <button onClick={() => {
          const next: BoardAxis = axis === "kanban_status" ? "pdca_phase" : "kanban_status";
          setAxis(next);
          telemetry.trackTaskBoardAxisToggle(detail.sprint.name, next === "kanban_status" ? "kanban" : "pdca");
        }}>
          Toggle ({axis === "kanban_status" ? "Kanban → PDCA" : "PDCA → Kanban"})
        </button>
        {canCreate && (
          <button aria-label="+" onClick={() => setShowCreateModal(true)}>+</button>
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="task-board">
          {cols.map(col => {
            const colTasks = detail.tasks.filter(t => t[axis] === col)
              .sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
            return (
              <div key={col} id={`tcol-${col}`} data-testid={`tcol-${col}`} className="task-board__col">
                <h4>{col}</h4>
                <SortableContext items={colTasks.map(t => t.name)} strategy={verticalListSortingStrategy}>
                  {colTasks.map(t => (
                    <Draggable key={t.name} task={t} draggable={canDrag(t)} onTaskOpen={setSelectedTask} />
                  ))}
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
      {selectedTask !== null && (
        <TaskDetailPanel
          taskName={selectedTask}
          sprintId={detail.sprint.name}
          currentUser={currentUser}
          role={userRole}
          onClose={() => setSelectedTask(null)}
          projectMembers={projectMembers}
        />
      )}
      {showCreateModal && (
        <TaskCreateModal
          sprintId={detail.sprint.name}
          projectId={detail.sprint.project}
          currentUser={currentUser}
          onCreated={(taskName) => { setSelectedTask(taskName); setShowCreateModal(false); }}
          onClose={() => setShowCreateModal(false)}
          projectMembers={projectMembers}
        />
      )}
    </div>
  );
}
