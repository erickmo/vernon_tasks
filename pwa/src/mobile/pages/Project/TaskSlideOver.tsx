import { useState, useEffect } from "react";
import type { ProjectTask } from "./api";

const PDCA_PHASES = ["Plan", "Do", "Check", "Act"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

interface Props {
  task: ProjectTask;
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    title: string;
    assigned_to?: string;
    deadline?: string;
    pdca_phase?: string;
    priority?: string;
  }) => void;
}

export function TaskSlideOver({ task, open, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [pdcaPhase, setPdcaPhase] = useState(task.pdca_phase);
  const [priority, setPriority] = useState(task.priority);

  useEffect(() => {
    if (open) {
      setEditing(false);
      setTitle(task.title);
      setAssignedTo(task.assigned_to ?? "");
      setDeadline(task.deadline ?? "");
      setPdcaPhase(task.pdca_phase);
      setPriority(task.priority);
    }
  }, [open, task]);

  if (!open) return null;

  return (
    <>
      <div
        data-testid="slide-backdrop"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 50,
        }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 360,
          maxWidth: "100vw", background: "#ffffff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          zIndex: 51, display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #e8edf3",
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
            {editing ? "Edit Task" : "Detail Task"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                style={{
                  background: "#ede9fe", color: "#5b21b6", border: "none",
                  borderRadius: 6, padding: "6px 12px", fontSize: 12,
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "1px solid #e8edf3",
                borderRadius: 6, padding: "6px 10px", fontSize: 14,
                cursor: "pointer", color: "#64748b",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Judul
                </span>
                <input
                  aria-label="Judul"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{
                    border: "1px solid #e8edf3", borderRadius: 6,
                    padding: "8px 10px", fontSize: 14, color: "#0f172a",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Assignee
                </span>
                <input
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  style={{
                    border: "1px solid #e8edf3", borderRadius: 6,
                    padding: "8px 10px", fontSize: 14, color: "#0f172a",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Deadline
                </span>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={{
                    border: "1px solid #e8edf3", borderRadius: 6,
                    padding: "8px 10px", fontSize: 14, color: "#0f172a",
                  }}
                />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  PDCA Phase
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PDCA_PHASES.map(p => (
                    <button
                      key={p}
                      onClick={() => setPdcaPhase(p)}
                      style={{
                        background: pdcaPhase === p ? "#7c4dab" : "#f8fafc",
                        color: pdcaPhase === p ? "#fff" : "#64748b",
                        border: `1px solid ${pdcaPhase === p ? "#7c4dab" : "#e8edf3"}`,
                        borderRadius: 99, padding: "4px 12px",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#64748b",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Prioritas
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PRIORITIES.map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      style={{
                        background: priority === p ? "#7c4dab" : "#f8fafc",
                        color: priority === p ? "#fff" : "#64748b",
                        border: `1px solid ${priority === p ? "#7c4dab" : "#e8edf3"}`,
                        borderRadius: 99, padding: "4px 12px",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                {task.title}
              </h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  background: "#ede9fe", color: "#5b21b6", borderRadius: 99,
                  padding: "3px 10px", fontSize: 12, fontWeight: 600,
                }}>
                  {task.pdca_phase}
                </span>
                <span style={{
                  background: "#f8fafc", color: "#64748b",
                  border: "1px solid #e8edf3", borderRadius: 99,
                  padding: "3px 10px", fontSize: 12, fontWeight: 600,
                }}>
                  {task.priority}
                </span>
              </div>
              {task.assigned_to && (
                <div style={{ fontSize: 13, color: "#64748b" }}>👤 {task.assigned_to}</div>
              )}
              {task.deadline && (
                <div style={{ fontSize: 13, color: "#64748b" }}>📅 {task.deadline}</div>
              )}
              {task.base_points > 0 && (
                <div style={{ fontSize: 13, color: "#64748b" }}>⭐ {task.base_points} pts</div>
              )}
            </div>
          )}
        </div>

        {/* Footer — edit mode only */}
        {editing && (
          <div style={{
            padding: "12px 20px", borderTop: "1px solid #e8edf3",
            display: "flex", gap: 8,
          }}>
            <button
              onClick={() => setEditing(false)}
              style={{
                flex: 1, background: "#f8fafc", border: "1px solid #e8edf3",
                borderRadius: 8, padding: "10px", fontSize: 13,
                fontWeight: 600, cursor: "pointer", color: "#64748b",
              }}
            >
              Batal
            </button>
            <button
              onClick={() => onSave({
                name: task.name,
                title,
                assigned_to: assignedTo || undefined,
                deadline: deadline || undefined,
                pdca_phase: pdcaPhase,
                priority,
              })}
              style={{
                flex: 2, background: "#7c4dab", color: "#fff", border: "none",
                borderRadius: 8, padding: "10px", fontSize: 13,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Simpan
            </button>
          </div>
        )}
      </div>
    </>
  );
}
