import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "../../../portal/projects/hooks/useProjects";
import { usePermissions } from "../../../auth/usePermissions";
import { createProject, updateProject, deleteProject } from "../../../portal/projects/api/projects";
import { projectKeys } from "../../../portal/projects/hooks/keys";
import type { ProjectRow } from "../../../portal/projects/api/types";

type Tab = "Aktif" | "Semua" | "Selesai";

const TAB_STATUSES: Record<Tab, string[]> = {
  Aktif: ["Open", "On Track", "At Risk"],
  Semua: [],
  Selesai: ["Closed"],
};

const PROJECT_STATUSES = ["Open", "On Track", "At Risk", "Closed"] as const;

interface ProjectFormModalProps {
  mode: "create" | "edit";
  initial?: { title: string; status: string };
  onSave: (values: { title: string; status: string }) => Promise<void>;
  onCancel: () => void;
}

function ProjectFormModal({ mode, initial, onSave, onCancel }: ProjectFormModalProps) {
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

interface Props {
  selectedId: string | null;
  onSelect: (id: string, title: string) => void;
}

export function ProjectSidebar({ selectedId, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("Aktif");
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null);
  const { can } = usePermissions();
  const canWrite = can("project.write");
  const qc = useQueryClient();

  const statuses = TAB_STATUSES[tab];
  const filters = statuses.length > 0 ? { statuses } : {};
  const { data: projects = [], isLoading } = useProjects(filters);

  const filtered = projects.filter(p =>
    search === "" || p.title.toLowerCase().includes(search.toLowerCase()),
  );

  function invalidateProjects() {
    qc.invalidateQueries({ queryKey: projectKeys.lists() });
  }

  async function handleCreate(values: { title: string; status: string }) {
    await createProject({ title: values.title, status: values.status });
    setFormMode(null);
    invalidateProjects();
  }

  async function handleEdit(values: { title: string; status: string }) {
    if (!editTarget) return;
    await updateProject(editTarget.name, { title: values.title, status: values.status });
    setFormMode(null);
    setEditTarget(null);
    invalidateProjects();
  }

  async function handleDelete(project: ProjectRow) {
    if (!confirm(`Hapus proyek "${project.title}"?`)) return;
    await deleteProject(project.name);
    setMenuId(null);
    invalidateProjects();
  }

  return (
    <div style={{
      width: 220, minWidth: 220, display: "flex", flexDirection: "column",
      background: "#ffffff", borderRight: "1px solid #e8edf3", height: "100%",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#6836a0 0%,#7c4dab 100%)",
        color: "#ffffff", padding: "14px 14px 10px",
      }}>
        <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Proyek
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Project</span>
          {canWrite && (
            <button
              onClick={() => setFormMode("create")}
              style={{
                background: "rgba(255,255,255,0.2)", color: "#fff", border: "none",
                borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              + Baru
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e8edf3" }}>
        {(["Aktif", "Semua", "Selesai"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600, border: "none",
              borderBottom: tab === t ? "2px solid #7c4dab" : "2px solid transparent",
              color: tab === t ? "#7c4dab" : "#64748b",
              background: "transparent", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #e8edf3" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari proyek..."
          style={{
            width: "100%", boxSizing: "border-box" as const,
            background: "#f8fafc", border: "1px solid #e8edf3",
            borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#0f172a",
          }}
        />
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {isLoading && (
          <div style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>Memuat...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: "#94a3b8", textAlign: "center" as const }}>
            Tidak ada proyek
          </div>
        )}
        {filtered.map(p => (
          <div
            key={p.name}
            style={{
              padding: "10px 12px", cursor: "pointer", position: "relative" as const,
              borderLeft: selectedId === p.name ? "3px solid #7c4dab" : "3px solid transparent",
              background: selectedId === p.name ? "#ede9fe" : "transparent",
            }}
            onClick={() => { onSelect(p.name, p.title); setMenuId(null); }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{
                fontWeight: 600, fontSize: 12,
                color: selectedId === p.name ? "#5b21b6" : "#0f172a",
              }}>
                {p.title}
              </span>
              {canWrite && (
                <button
                  onClick={e => { e.stopPropagation(); setMenuId(menuId === p.name ? null : p.name); }}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "#94a3b8", fontSize: 16, padding: "0 2px", lineHeight: 1,
                  }}
                >
                  ⋯
                </button>
              )}
            </div>
            <div style={{
              fontSize: 10, marginTop: 3,
              color: selectedId === p.name ? "#7c3aed" : "#64748b",
            }}>
              {p.status}
            </div>

            {/* Dropdown menu */}
            {menuId === p.name && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute" as const, right: 8, top: 32, background: "#fff",
                  border: "1px solid #e8edf3", borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.10)", zIndex: 20, minWidth: 110,
                }}
              >
                <button
                  onClick={() => { setEditTarget(p); setFormMode("edit"); setMenuId(null); }}
                  style={{
                    display: "block", width: "100%", padding: "8px 14px",
                    fontSize: 12, color: "#0f172a", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left" as const,
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  style={{
                    display: "block", width: "100%", padding: "8px 14px",
                    fontSize: 12, color: "#dc2626", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left" as const,
                  }}
                >
                  Hapus
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Project form modals */}
      {formMode === "create" && (
        <ProjectFormModal
          mode="create"
          onSave={handleCreate}
          onCancel={() => setFormMode(null)}
        />
      )}
      {formMode === "edit" && editTarget && (
        <ProjectFormModal
          mode="edit"
          initial={{ title: editTarget.title, status: editTarget.status }}
          onSave={handleEdit}
          onCancel={() => { setFormMode(null); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
