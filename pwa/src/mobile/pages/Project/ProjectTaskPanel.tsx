import { useState } from "react";
import { useProjectTasks, useInvalidateProjectTasks } from "./useProjectTasks";
import { createTask, updateTask, type ProjectTask } from "./api";
import { completeTask, logProgress, snoozeTask } from "../../../api/mutations";
import { SwipeRow } from "../../../components/SwipeRow";
import { TaskActions } from "../../../components/TaskActions";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import { useToast } from "../../../components/Toast";
import { LogProgressModal } from "../../../components/LogProgressModal";
import { TaskSlideOver } from "./TaskSlideOver";

const PDCA_PHASES = ["All", "Plan", "Do", "Check", "Act"];

const PRIORITY_ACCENT: Record<string, string> = {
  High: "#dc2626", Urgent: "#dc2626", Medium: "#7c4dab", Low: "#94a3b8",
};

interface Props {
  projectId: string | null;
  projectTitle: string | null;
}

export function ProjectTaskPanel({ projectId, projectTitle }: Props) {
  const [pdcaFilter, setPdcaFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [slideTask, setSlideTask] = useState<ProjectTask | null>(null);
  const [logTask, setLogTask] = useState<ProjectTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const { show } = useToast();
  const invalidate = useInvalidateProjectTasks();

  const filters = pdcaFilter !== "All" ? { pdca_phase: pdcaFilter } : {};
  const { data: tasks, isLoading } = useProjectTasks(projectId, filters);

  const filtered = (tasks ?? []).filter(t =>
    search === "" || t.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (projectId === null) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f1f5f9",
      }}>
        <EmptyState title="Pilih proyek untuk melihat task" />
      </div>
    );
  }

  async function handleComplete(task: ProjectTask) {
    try {
      await completeTask(task.name);
      invalidate(projectId!);
    } catch {
      show("Gagal menyelesaikan task");
    }
  }

  async function handleLog(task: ProjectTask, hours: number, note: string) {
    setLogTask(null);
    try {
      await logProgress(task.name, hours, note);
      show("Progress dicatat");
    } catch {
      show("Gagal mencatat progress");
    }
  }

  async function handleSnooze(task: ProjectTask) {
    try {
      await snoozeTask(task.name, 1);
      invalidate(projectId!);
    } catch {
      show("Gagal menunda task");
    }
  }

  async function handleSave(payload: Parameters<typeof updateTask>[0]) {
    setSlideTask(null);
    try {
      await updateTask(payload);
      invalidate(projectId!);
      show("Task diperbarui");
    } catch {
      show("Gagal memperbarui task");
    }
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    try {
      await createTask({ project: projectId!, title: newTitle.trim() });
      setNewTitle("");
      setShowCreate(false);
      invalidate(projectId!);
      show("Task dibuat");
    } catch {
      show("Gagal membuat task");
    }
  }

  const taskCount = tasks?.length ?? 0;
  const doneCount = tasks?.filter(t => t.completion_date).length ?? 0;

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: "#f1f5f9", minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        background: "#ffffff", borderBottom: "1px solid #e8edf3", padding: "12px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            {projectTitle}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{
              background: "#ede9fe", color: "#7c3aed", borderRadius: 99,
              padding: "2px 8px", fontSize: 11, fontWeight: 600,
            }}>
              {taskCount} tasks
            </span>
            <span style={{
              background: "#f0fdf4", color: "#16a34a", borderRadius: 99,
              padding: "2px 8px", fontSize: 11, fontWeight: 600,
            }}>
              {doneCount} done
            </span>
          </div>
        </div>
        {/* PDCA chips */}
        <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {PDCA_PHASES.map(phase => (
            <button
              key={phase}
              onClick={() => setPdcaFilter(phase)}
              style={{
                background: pdcaFilter === phase ? "#7c4dab" : "#f8fafc",
                color: pdcaFilter === phase ? "#fff" : "#64748b",
                border: `1px solid ${pdcaFilter === phase ? "#7c4dab" : "#e8edf3"}`,
                borderRadius: 99, padding: "3px 10px",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              {phase}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        background: "#ffffff", borderBottom: "1px solid #e8edf3",
        padding: "8px 12px", display: "flex", gap: 8,
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari task..."
          style={{
            flex: 1, background: "#f8fafc", border: "1px solid #e8edf3",
            borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#0f172a",
          }}
        />
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "#7c4dab", color: "#fff", border: "none",
            borderRadius: 6, padding: "6px 12px", fontSize: 12,
            fontWeight: 700, cursor: "pointer",
          }}
        >
          + Task
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: "#ede9fe", padding: "10px 12px",
          display: "flex", gap: 8, borderBottom: "1px solid #c4b5fd",
        }}>
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
            placeholder="Nama task baru..."
            style={{
              flex: 1, border: "1px solid #c4b5fd", borderRadius: 6,
              padding: "6px 10px", fontSize: 13, color: "#0f172a",
            }}
          />
          <button
            onClick={handleCreate}
            style={{
              background: "#7c4dab", color: "#fff", border: "none",
              borderRadius: 6, padding: "6px 12px", fontSize: 12,
              fontWeight: 700, cursor: "pointer",
            }}
          >
            OK
          </button>
          <button
            onClick={() => setShowCreate(false)}
            style={{
              background: "transparent", border: "1px solid #c4b5fd",
              borderRadius: 6, padding: "6px 10px", fontSize: 12,
              cursor: "pointer", color: "#64748b",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 32px" }}>
        {isLoading && (
          <>
            <div data-testid="task-skeleton"><Skeleton height={56} /></div>
            <div style={{ height: 8 }} />
            <Skeleton height={56} />
          </>
        )}
        {!isLoading && filtered.length === 0 && (
          <EmptyState title="Belum ada task di proyek ini" />
        )}
        {filtered.map(task => {
          const accent = PRIORITY_ACCENT[task.priority] ?? "#94a3b8";
          return (
            <div key={task.name} style={{ marginBottom: 8 }}>
              <SwipeRow
                actions={
                  <TaskActions
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task)}
                    disabled={false}
                  />
                }
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#ffffff", borderRadius: 8,
                  padding: "10px 12px",
                  borderLeft: `3px solid ${accent}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}>
                  <input
                    type="checkbox"
                    checked={Boolean(task.completion_date)}
                    onChange={() => handleComplete(task)}
                    style={{ accentColor: "#7c4dab", width: 18, height: 18 }}
                  />
                  <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={() => setSlideTask(task)}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                      {task.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                      {[task.assigned_to, task.pdca_phase, task.priority]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span
                    style={{ fontSize: 18, color: "#94a3b8", cursor: "pointer" }}
                    onClick={() => setSlideTask(task)}
                  >
                    ›
                  </span>
                </div>
              </SwipeRow>
            </div>
          );
        })}
      </div>

      {slideTask && (
        <TaskSlideOver
          task={slideTask}
          open={Boolean(slideTask)}
          onClose={() => setSlideTask(null)}
          onSave={handleSave}
        />
      )}

      <LogProgressModal
        open={logTask !== null}
        onSubmit={(h: number, n: string) => logTask && handleLog(logTask, h, n)}
        onCancel={() => setLogTask(null)}
      />
    </div>
  );
}
