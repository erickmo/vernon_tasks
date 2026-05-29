import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "../../../portal/projects/hooks/useProjects";
import { usePermissions } from "../../../auth/usePermissions";
import { createProject, updateProject, deleteProject } from "../../../portal/projects/api/projects";
import { projectKeys } from "../../../portal/projects/hooks/keys";
import type { ProjectRow } from "../../../portal/projects/api/types";
import { ProjectFormModal } from "../../../components/ProjectFormModal";

type Tab = "Aktif" | "Semua" | "Selesai";

const TAB_STATUSES: Record<Tab, string[]> = {
  Aktif: ["Open", "On Track", "At Risk"],
  Semua: [],
  Selesai: ["Closed"],
};

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
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("project.write");
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
          <div style={{ padding: 16, textAlign: "center" as const }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: canWrite ? 12 : 0 }}>
              Tidak ada proyek
            </div>
            {canWrite && (
              <button
                onClick={() => setFormMode("create")}
                style={{
                  background: "#7c4dab", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 14px", fontSize: 12,
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                + Buat proyek pertama
              </button>
            )}
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
