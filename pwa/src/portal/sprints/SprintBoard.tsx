import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSprintBoard } from "./hooks/useSprintBoard";
import { SprintCard } from "./SprintCard";
import { SprintEditor } from "./SprintEditor";
import type { SprintRow, SprintStatus } from "./api/types";
import * as telemetry from "../../telemetry";

const COLUMNS: SprintStatus[] = ["Planning", "Active", "Review", "Closed"];

function DraggableSprint({ row }: { row: SprintRow }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.name });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SprintCard row={row} />
    </div>
  );
}

export function SprintBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data = [], isLoading, moveSprint } = useSprintBoard(projectId ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const qc = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    if (projectId && data) telemetry.trackSprintBoardView(projectId, data.length);
  }, [projectId, data?.length]);

  if (isLoading) return <div>Loading…</div>;

  function onDragEnd(ev: DragEndEvent) {
    const sprintId = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId) return;
    const target = COLUMNS.find(c => overId === `col-${c}`) ?? data.find(s => s.name === overId)?.status;
    if (!target) return;
    const current = data.find(s => s.name === sprintId);
    if (!current || current.status === target) return;
    moveSprint.mutate({ name: sprintId, toStatus: target as SprintStatus });
    telemetry.trackSprintMove(sprintId, current.status, target as SprintStatus);
  }

  return (
    <>
      <button onClick={() => setEditorOpen(true)}>+ New sprint</button>
      {editorOpen && (
        <SprintEditor
          mode="create"
          projectId={projectId ?? ""}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            qc.invalidateQueries({ queryKey: ["sprintBoard", projectId] });
          }}
        />
      )}
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="sprint-board">
        {COLUMNS.map(col => {
          const colSprints = data.filter(s => s.status === col);
          return (
            <div key={col} data-testid={`col-${col}`} id={`col-${col}`} className="sprint-board__col">
              <h3>{col}</h3>
              <SortableContext items={colSprints.map(s => s.name)} strategy={verticalListSortingStrategy}>
                {colSprints.map(s => <DraggableSprint key={s.name} row={s} />)}
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
    </>
  );
}
