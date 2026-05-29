import { useState } from "react";

const PROJECT_STATUSES = ["Open", "On Track", "At Risk", "Closed"] as const;

export interface ProjectFormModalProps {
  mode: "create" | "edit";
  initial?: { title: string; status: string };
  onSave: (values: { title: string; status: string }) => Promise<void>;
  onCancel: () => void;
}

export function ProjectFormModal({ mode, initial, onSave, onCancel }: ProjectFormModalProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Open");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try { await onSave({ title: title.trim(), status }); } finally { setSaving(false); }
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, padding: 24,
        width: 320, maxWidth: "90vw", zIndex: 61,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
          {mode === "create" ? "Buat Proyek" : "Edit Proyek"}
        </h3>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Nama</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
          >
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b" }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{ flex: 2, background: "#7c4dab", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </>
  );
}
