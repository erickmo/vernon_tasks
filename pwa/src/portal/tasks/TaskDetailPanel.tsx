import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTaskDetail } from "./hooks/useTaskDetail";
import { useTaskComments } from "./hooks/useTaskComments";
import { updateTask } from "./api/tasks";
import { ActivityLog } from "./ActivityLog";
import { CommentThread } from "./CommentThread";
import type { KanbanStatus, PdcaPhase, SprintDetail, TaskCardData } from "../sprints/api/types";
import type { UpdateTaskPayload } from "./api/types";

// TODO(Task 12): import trackTaskDetailView, trackTaskPanelClosed, trackTaskUpdated from telemetry

const KANBAN_OPTIONS: KanbanStatus[] = [
  "Backlog",
  "Scheduled",
  "In Progress",
  "In Review",
  "Revision",
  "Done",
  "Blocked",
];
const PDCA_OPTIONS: PdcaPhase[] = ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;

interface Props {
  taskName: string;
  sprintId: string;
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onClose: () => void;
  projectMembers?: { email: string; full_name: string }[];
}

export function TaskDetailPanel({
  taskName,
  sprintId,
  currentUser,
  role,
  onClose,
  projectMembers = [],
}: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useTaskDetail(taskName, sprintId);
  const { entries, addComment, deleteComment, isAddingComment } = useTaskComments(taskName);

  const [titleDraft, setTitleDraft] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync title draft when data loads
  useEffect(() => {
    if (data?.task.title !== undefined) {
      setTitleDraft(data.task.title);
    }
  }, [data?.task.title]);

  // TODO(Task 12): trackTaskDetailView(taskName) on mount

  // Escape key closes panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // TODO(Task 12): trackTaskPanelClosed(taskName)
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canEdit = useCallback(
    (field: string) => (data?.permitted_fields ?? []).includes(field),
    [data?.permitted_fields],
  );

  async function saveField(payload: UpdateTaskPayload) {
    if (!data) return;

    const prevTaskDetail = qc.getQueryData(["taskDetail", taskName]);
    const prevSprintDetail = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);

    // Optimistic update — taskDetail cache
    qc.setQueryData(["taskDetail", taskName], {
      ...data,
      task: { ...data.task, ...payload },
    });

    // Optimistic update — sprintDetail tasks cache
    if (prevSprintDetail) {
      qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], {
        ...prevSprintDetail,
        tasks: prevSprintDetail.tasks.map((t: TaskCardData) =>
          t.name === taskName
            ? {
                ...t,
                ...(payload.kanban_status !== undefined && { kanban_status: payload.kanban_status }),
                ...(payload.pdca_phase !== undefined && { pdca_phase: payload.pdca_phase }),
                ...(payload.priority !== undefined && { priority: payload.priority }),
                ...(payload.estimated_hours !== undefined && { estimated_hours: payload.estimated_hours }),
                ...(payload.deadline !== undefined && { deadline: payload.deadline ?? null }),
              }
            : t,
        ),
      });
    }

    setIsSaving(true);
    try {
      const result = await updateTask(taskName, payload);
      qc.setQueryData(["taskDetail", taskName], result);
      // TODO(Task 12): trackTaskUpdated(taskName, Object.keys(payload))
    } catch {
      // Rollback on error
      qc.setQueryData(["taskDetail", taskName], prevTaskDetail);
      if (prevSprintDetail) {
        qc.setQueryData(["sprintDetail", sprintId], prevSprintDetail);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleTitleBlur() {
    if (!data || !canEdit("title")) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== data.task.title) {
      saveField({ title: trimmed });
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setTitleDraft(data?.task.title ?? "");
      (e.target as HTMLInputElement).blur();
    }
  }

  if (isLoading && !data) {
    return (
      <div className="task-detail-panel task-detail-panel--loading" ref={panelRef}>
        <p>Memuat tugas...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="task-detail-panel task-detail-panel--error" ref={panelRef}>
        <p>Tugas tidak ditemukan.</p>
      </div>
    );
  }

  const { task, permitted_fields } = data;
  const comments = entries.filter((e) => e.type === "comment") as import("./api/types").CommentEntry[];

  return (
    <div className="task-detail-panel" ref={panelRef} aria-label="Task detail panel">
      {/* Header */}
      <div className="task-detail-panel__header">
        <span className="task-detail-panel__task-name">{task.name}</span>
        <button
          className="task-detail-panel__close"
          aria-label="close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Title */}
      <div className="task-detail-panel__field task-detail-panel__field--title">
        {canEdit("title") ? (
          <input
            className="task-detail-panel__title-input"
            type="text"
            value={titleDraft}
            disabled={isSaving}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
          />
        ) : (
          <h2 className="task-detail-panel__title">{task.title}</h2>
        )}
      </div>

      {/* Read-only meta */}
      <div className="task-detail-panel__meta">
        <div className="task-detail-panel__meta-row">
          <span className="task-detail-panel__label">Proyek</span>
          <span className="task-detail-panel__value">{task.project}</span>
        </div>
        <div className="task-detail-panel__meta-row">
          <span className="task-detail-panel__label">Sprint</span>
          <span className="task-detail-panel__value">{task.sprint}</span>
        </div>
      </div>

      {/* Kanban Status */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Status Kanban</label>
        {canEdit("kanban_status") ? (
          <select
            className="task-detail-panel__select"
            value={task.kanban_status}
            disabled={isSaving}
            onChange={(e) => saveField({ kanban_status: e.target.value as KanbanStatus })}
          >
            {KANBAN_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className="task-detail-panel__value">{task.kanban_status}</span>
        )}
      </div>

      {/* PDCA Phase */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Fase PDCA</label>
        {canEdit("pdca_phase") ? (
          <select
            className="task-detail-panel__select"
            value={task.pdca_phase}
            disabled={isSaving}
            onChange={(e) => saveField({ pdca_phase: e.target.value as PdcaPhase })}
          >
            {PDCA_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <span className="task-detail-panel__value">{task.pdca_phase}</span>
        )}
      </div>

      {/* Priority */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Prioritas</label>
        {canEdit("priority") ? (
          <select
            className="task-detail-panel__select"
            value={task.priority}
            disabled={isSaving}
            onChange={(e) =>
              saveField({ priority: e.target.value as (typeof PRIORITY_OPTIONS)[number] })
            }
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <span className="task-detail-panel__value">{task.priority}</span>
        )}
      </div>

      {/* Estimated Hours */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Estimasi Jam</label>
        {canEdit("estimated_hours") ? (
          <input
            className="task-detail-panel__number-input"
            type="number"
            min={0}
            step={0.5}
            defaultValue={task.estimated_hours}
            disabled={isSaving}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val !== task.estimated_hours) {
                saveField({ estimated_hours: val });
              }
            }}
          />
        ) : (
          <span className="task-detail-panel__value">{task.estimated_hours}</span>
        )}
      </div>

      {/* Deadline */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Deadline</label>
        {canEdit("deadline") ? (
          <input
            className="task-detail-panel__date-input"
            type="date"
            defaultValue={task.deadline ?? ""}
            disabled={isSaving}
            onBlur={(e) => {
              const val = e.target.value || null;
              if (val !== task.deadline) {
                saveField({ deadline: val });
              }
            }}
          />
        ) : (
          <span className="task-detail-panel__value">{task.deadline ?? "—"}</span>
        )}
      </div>

      {/* Assigned To */}
      <div className="task-detail-panel__field">
        <label className="task-detail-panel__label">Ditugaskan ke</label>
        {canEdit("assigned_to") && projectMembers.length > 0 ? (
          <select
            className="task-detail-panel__select"
            value={task.assigned_to ?? ""}
            disabled={isSaving}
            onChange={(e) => saveField({ assigned_to: e.target.value || null })}
          >
            <option value="">— Tidak ada —</option>
            {projectMembers.map((m) => (
              <option key={m.email} value={m.email}>{m.full_name}</option>
            ))}
          </select>
        ) : (
          <span className="task-detail-panel__value">
            {task.assigned_to_full_name ?? task.assigned_to ?? "—"}
          </span>
        )}
      </div>

      {/* Activity + Comments */}
      <div className="task-detail-panel__activity">
        <h3 className="task-detail-panel__section-title">Aktivitas</h3>
        <ActivityLog
          entries={entries}
          currentUser={currentUser}
          role={role}
          onDeleteComment={deleteComment}
        />
        <CommentThread
          taskName={taskName}
          currentUser={currentUser}
          role={role}
          onAddComment={addComment}
          isAddingComment={isAddingComment}
          existingComments={comments}
          onDeleteComment={deleteComment}
        />
      </div>

      {permitted_fields.length === 0 && (
        <p className="task-detail-panel__readonly-notice">
          Anda hanya memiliki akses baca pada tugas ini.
        </p>
      )}
    </div>
  );
}
