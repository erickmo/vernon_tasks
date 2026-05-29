/**
 * SprintBoardMobile — mobile sprint kanban page at /m/sprint/:sprintId.
 * Horizontal-scroll columns, kanban<->pdca axis toggle, drag-to-move via dnd-kit
 * backed by useSprintBoard (optimistic + rollback + rebalance). Loading/empty/
 * error/pending/toast states. No new Python; entry point is the dashboard card.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useSprintBoard, type MoveArgs } from "./hooks/useSprintBoard";
import { MobileKanbanColumn } from "./MobileKanbanColumn";
import { columnsFor } from "./lib/columns";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { EmptyState } from "../../../components/EmptyState";
import { useToast } from "../../../components/Toast";
import * as telemetry from "../../../telemetry";
import type { TaskCardData, BoardAxis } from "../../../portal/sprints/api/types";

/** Context the drag-end handler needs to resolve and dispatch a move. */
interface DragCtx {
  axis: BoardAxis;
  tasks: TaskCardData[];
  sprintId: string;
  move: (args: MoveArgs) => void;
}

/**
 * Pure drag-end logic, exported for unit testing (jsdom cannot do real drag).
 * Resolves the destination column from a `tcol-` drop id, else from the column
 * of the card it was dropped over, then computes the append rank for that column.
 * @param ev - dnd-kit DragEndEvent
 * @param ctx - active axis, tasks, sprintId, and move dispatcher
 */
export function __onDragEndForTest(ev: DragEndEvent, ctx: DragCtx) {
  const { axis, tasks, move } = ctx;
  const taskId = String(ev.active.id);
  const overId = ev.over?.id ? String(ev.over.id) : null;
  if (!overId) return;
  const cols = columnsFor(axis);
  const targetCol = cols.find((c) => overId === `tcol-${c}`) ?? (tasks.find((t) => t.name === overId)?.[axis] as string | undefined);
  if (!targetCol) return;
  const task = tasks.find((t) => t.name === taskId);
  if (!task) return;
  // No-op when dropping back onto the same column's empty area.
  if (task[axis] === targetCol && overId === `tcol-${targetCol}`) return;
  // Append to the end of the destination column (sorted by rank, excluding self).
  const colTasks = tasks
    .filter((t) => t[axis] === targetCol && t.name !== taskId)
    .sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
  const lastRank = colTasks.length ? colTasks[colTasks.length - 1].kanban_rank : null;
  move({ task: taskId, axis, targetColumn: targetCol, prevRank: lastRank, nextRank: null });
  telemetry.trackSprintTaskMoveMobile(task[axis] as string, targetCol, axis);
}

/** Render the mobile sprint board page. Route param: sprintId. */
export function SprintBoardMobile() {
  const { sprintId = "" } = useParams<{ sprintId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [axis, setAxis] = useState<BoardAxis>("kanban_status");
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, move } = useSprintBoard(sprintId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  useEffect(() => {
    if (sprintId) telemetry.trackSprintBoardOpen(sprintId);
  }, [sprintId]);

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <EmptyState title="Failed to load sprint" cta={{ label: "Retry", onClick: () => refetch() }} />;

  /** Dispatch a move with pending state + toast-on-error. */
  function dispatchMove(args: MoveArgs) {
    setPendingTaskId(args.task);
    move.mutate(args, {
      onError: () => toast.show("Move failed — reverted"),
      onSettled: () => setPendingTaskId(null),
    });
  }
  /** Flip the board axis and emit telemetry. */
  function onToggle() {
    const next: BoardAxis = axis === "kanban_status" ? "pdca_phase" : "kanban_status";
    setAxis(next);
    telemetry.trackSprintAxisToggle(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 0" }}>
        <button onClick={() => navigate("/m/dashboard")} aria-label="Back" style={{ background: "transparent", border: 0, fontSize: 18 }}>
          ‹
        </button>
        <h2 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0 }}>{data.sprint.sprint_title}</h2>
        <button onClick={onToggle} style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 99, border: "1px solid var(--vt-border, #e2e8f0)" }}>
          {axis === "kanban_status" ? "Switch to PDCA" : "Switch to Kanban"}
        </button>
      </div>
      {data.tasks.length === 0 ? (
        <EmptyState title="No tasks in this sprint" body="Tasks added in the portal will appear here." />
      ) : (
        <DndContext sensors={sensors} onDragEnd={(ev) => __onDragEndForTest(ev, { axis, tasks: data.tasks, sprintId, move: dispatchMove })}>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "12px", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {columnsFor(axis).map((col) => {
              const colTasks = data.tasks
                .filter((t) => (t[axis] as string) === col)
                .sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
              return <MobileKanbanColumn key={col} column={col} tasks={colTasks} pendingTaskId={pendingTaskId} />;
            })}
          </div>
        </DndContext>
      )}
    </div>
  );
}
