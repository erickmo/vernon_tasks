import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTask } from "./api/tasks";
import type { KanbanStatus, PdcaPhase, SprintDetail, TaskCardData } from "../sprints/api/types";
import type { CreateTaskPayload } from "./api/types";

import { trackTaskCreated } from "../../telemetry";

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;
const PDCA_OPTIONS: PdcaPhase[] = ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"];
const KANBAN_OPTIONS: KanbanStatus[] = [
  "Backlog",
  "Scheduled",
  "In Progress",
  "In Review",
  "Revision",
  "Done",
  "Blocked",
];

interface Props {
  sprintId: string;
  projectId: string;
  currentUser: string;
  onCreated: (taskName: string) => void;
  onClose: () => void;
  projectMembers?: { email: string; full_name: string }[];
}

export function TaskCreateModal({
  sprintId,
  projectId,
  currentUser,
  onCreated,
  onClose,
  projectMembers = [],
}: Props) {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>("Medium");
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [deadline, setDeadline] = useState("");
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [pdcaPhase, setPdcaPhase] = useState<PdcaPhase>("BACKLOG");
  const [kanbanStatus, setKanbanStatus] = useState<KanbanStatus>("Backlog");

  const [titleError, setTitleError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function buildOptimisticCard(tmpName: string): TaskCardData {
    return {
      name: tmpName,
      title,
      assigned_to: assignedTo || null,
      kanban_status: kanbanStatus,
      pdca_phase: pdcaPhase,
      kanban_rank: null as unknown as number,
      estimated_hours: estimatedHours,
      weight: 1,
      priority,
      deadline: deadline || null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    if (!title.trim()) {
      setTitleError("Title tidak boleh kosong");
      return;
    }
    setTitleError("");
    setSubmitError("");

    const tmpName = `tmp-${crypto.randomUUID()}`;
    const optimisticCard = buildOptimisticCard(tmpName);

    // Optimistic insert into sprint cache
    qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], (old) => {
      if (!old) return old;
      return { ...old, tasks: [...old.tasks, optimisticCard] };
    });

    setSubmitting(true);

    const payload: CreateTaskPayload = {
      sprint: sprintId,
      project: projectId,
      title: title.trim(),
      priority,
      estimated_hours: estimatedHours,
      ...(deadline ? { deadline } : {}),
      ...(assignedTo ? { assigned_to: assignedTo } : {}),
      pdca_phase: pdcaPhase,
      kanban_status: kanbanStatus,
    };

    try {
      const result = await createTask(payload);

      // Swap tmp card with real card
      qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) => (t.name === tmpName ? result.task : t)),
        };
      });

      trackTaskCreated(result.name, sprintId, projectId);

      onCreated(result.name);
      onClose();
    } catch (err: unknown) {
      // Remove provisional card on failure
      qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], (old) => {
        if (!old) return old;
        return { ...old, tasks: old.tasks.filter((t) => t.name !== tmpName) };
      });

      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Buat Tugas Baru">
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="tc-title">Judul Tugas *</label>
          <input
            id="tc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
          />
          {titleError && <span role="alert">{titleError}</span>}
        </div>

        <div>
          <label htmlFor="tc-priority">Prioritas</label>
          <select
            id="tc-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as (typeof PRIORITY_OPTIONS)[number])}
            disabled={submitting}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tc-estimated-hours">Estimasi Jam</label>
          <input
            id="tc-estimated-hours"
            type="number"
            min={0.5}
            step={0.5}
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(Number(e.target.value))}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="tc-deadline">Tenggat Waktu</label>
          <input
            id="tc-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={submitting}
          />
        </div>

        {projectMembers.length > 0 && (
          <div>
            <label htmlFor="tc-assigned-to">Ditugaskan ke</label>
            <select
              id="tc-assigned-to"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={submitting}
            >
              <option value="">-- Tidak ada --</option>
              {projectMembers.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="tc-pdca-phase">Fase PDCA</label>
          <select
            id="tc-pdca-phase"
            value={pdcaPhase}
            onChange={(e) => setPdcaPhase(e.target.value as PdcaPhase)}
            disabled={submitting}
          >
            {PDCA_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tc-kanban-status">Status Kanban</label>
          <select
            id="tc-kanban-status"
            value={kanbanStatus}
            onChange={(e) => setKanbanStatus(e.target.value as KanbanStatus)}
            disabled={submitting}
          >
            {KANBAN_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        {submitError && <div role="alert">{submitError}</div>}

        <div>
          <button type="button" onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Membuat…" : "Buat"}
          </button>
        </div>
      </form>
    </div>
  );
}
