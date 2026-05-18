import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./TaskCard";
import { useTaskBoard } from "./hooks/useTaskBoard";
import type { SprintDetail, TaskCardData, BoardAxis, KanbanStatus, PdcaPhase } from "./api/types";
import * as telemetry from "../../telemetry";

const KANBAN_COLS: KanbanStatus[] = ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"];
const PDCA_COLS: PdcaPhase[] = ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"];

interface Props { detail: SprintDetail; currentUser: string; canEditAll: boolean; }

function Draggable({ task, draggable }: { task: TaskCardData; draggable: boolean }) {
  const sortable = useSortable({ id: task.name, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <div ref={sortable.setNodeRef} style={style}
         {...(draggable ? sortable.attributes : {})} {...(draggable ? sortable.listeners : {})}>
      <TaskCard task={task} draggable={draggable} />
    </div>
  );
}

export function TaskBoard({ detail, currentUser, canEditAll }: Props) {
  const [axis, setAxis] = useState<BoardAxis>("kanban_status");
  const cols: readonly string[] = axis === "kanban_status" ? KANBAN_COLS : PDCA_COLS;
  const { move } = useTaskBoard(detail.sprint.name);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

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
      .sort((a, b) => a.kanban_rank - b.kanban_rank);
    const lastRank = colTasks.length ? colTasks[colTasks.length - 1].kanban_rank : null;
    move.mutate({ task: taskId, axis, targetColumn: targetCol, prevRank: lastRank, nextRank: null });
    telemetry.trackTaskMove(taskId, detail.sprint.name,
      axis === "kanban_status" ? "kanban" : "pdca", task[axis] as string, targetCol);
  }

  return (
    <div>
      <button onClick={() => {
        const next: BoardAxis = axis === "kanban_status" ? "pdca_phase" : "kanban_status";
        setAxis(next);
        telemetry.trackTaskBoardAxisToggle(detail.sprint.name, next === "kanban_status" ? "kanban" : "pdca");
      }}>
        Toggle ({axis === "kanban_status" ? "Kanban → PDCA" : "PDCA → Kanban"})
      </button>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="task-board">
          {cols.map(col => {
            const colTasks = detail.tasks.filter(t => t[axis] === col)
              .sort((a, b) => a.kanban_rank - b.kanban_rank);
            return (
              <div key={col} id={`tcol-${col}`} data-testid={`tcol-${col}`} className="task-board__col">
                <h4>{col}</h4>
                <SortableContext items={colTasks.map(t => t.name)} strategy={verticalListSortingStrategy}>
                  {colTasks.map(t => <Draggable key={t.name} task={t} draggable={canDrag(t)} />)}
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
