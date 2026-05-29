import { useState } from "react";
import { createTask } from "../mobile/pages/Project/api";
import { logEvent } from "../telemetry";

export interface QuickAddProject { name: string; title: string; }

interface Props {
  projects: QuickAddProject[];
  onClose: () => void;
  onCreated: () => void;
}

export function QuickAddTaskModal({ projects, onClose, onCreated }: Props) {
  const [project, setProject] = useState(projects[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!project || !title.trim()) return;
    setSaving(true);
    try {
      await createTask({ project, title: title.trim() });
      logEvent("quick_add_task_submit", { project });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, padding: 24, width: 320, maxWidth: "90vw",
        zIndex: 61, boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Tugas Baru</h3>
        {projects.length === 0 ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Buat proyek dulu sebelum menambahkan tugas.
          </div>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</span>
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
              >
                {projects.map(p => <option key={p.name} value={p.name}>{p.title}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Judul</span>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b" }}
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !title.trim() || !project}
                style={{ flex: 2, background: "#7c4dab", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Menyimpan..." : "Tambah"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
