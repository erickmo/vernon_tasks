import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FilterBar } from './list/FilterBar';
import { ProjectListTable } from './list/ProjectListTable';
import { ProjectFormModal, type ProjectFormMode } from '@/components/ProjectFormModal';
import {
  KEY,
  deleteProject,
  getProjectDetail,
  getProjectPermissions,
  listProjects,
} from './projectsApi';
import { FolderIcon } from '@/components/icons';
import type { ProjectListFilters, ProjectListRow } from './types';

type FilterStore = { value: ProjectListFilters; set: (v: ProjectListFilters) => void };
const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      value: { active: true, mine: true },
      set: (v) => set({ value: v }),
    }),
    { name: 'vernon-projects-filters' },
  ),
);

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ProjectListPage() {
  const { value: filters, set: setFilters } = useFilterStore();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: KEY.list(filters),
    queryFn: () => listProjects(filters),
  });
  const { data: perms } = useQuery({
    queryKey: KEY.permissions(),
    queryFn: getProjectPermissions,
    staleTime: 5 * 60 * 1000,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<ProjectFormMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectListRow | null>(null);

  const canCreate = !!perms?.can_create;
  const canEdit = !!perms?.can_write;
  const canDelete = !!perms?.can_delete;

  const del = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setPendingDelete(null);
    },
  });

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (!data) return;
    setSelected((s) => (s.size === data.length ? new Set() : new Set(data.map((r) => r.id))));
  }

  async function openEdit(row: ProjectListRow) {
    try {
      const detail = await qc.fetchQuery({
        queryKey: KEY.detail(row.id),
        queryFn: () => getProjectDetail(row.id),
      });
      setModalMode({
        kind: 'edit',
        projectId: row.id,
        initial: {
          title: detail.title,
          brand: detail.brand ?? '',
          project_owner: detail.project_owner ?? detail.project_lead ?? '',
          project_leader: detail.project_leader ?? detail.project_lead ?? '',
          start_date: detail.start_date ?? '',
          end_date: detail.end_date ?? '',
          status: (detail.status as any) ?? 'Open',
          pdca_phase: (detail.pdca_phase as any) ?? 'PLAN',
          objective: detail.linked_objective ?? '',
          blocked_days_threshold: detail.blocked_days_threshold ?? null,
          slip_pct_threshold: detail.slip_pct_threshold ?? null,
          capacity_pct_threshold: detail.capacity_pct_threshold ?? null,
          team_members: detail.team_members ?? [],
        },
      });
    } catch {
      setModalMode({
        kind: 'edit',
        projectId: row.id,
        initial: { title: row.name },
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {formatToday()}
          </div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-slate-900">Projects</h1>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModalMode({ kind: 'create' })}
            className="btn-primary btn-sm"
          >
            + New Project
          </button>
        )}
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      {isLoading && (
        <div className="card p-8 text-center text-sm text-slate-500">Loading projects…</div>
      )}
      {isError && (
        <div className="card p-8 text-center text-sm text-rose-600">Failed to load projects.</div>
      )}
      {data && data.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
          <FolderIcon className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No projects match these filters.</p>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <ProjectListTable
            rows={data}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={openEdit}
            onDelete={(r) => setPendingDelete(r)}
          />
        </div>
      )}

      <ProjectFormModal
        open={modalMode !== null}
        mode={modalMode}
        onClose={() => setModalMode(null)}
      />

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center"
        >
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
              Delete project?
            </h2>
            <p className="text-sm text-slate-600">
              <strong>{pendingDelete.name}</strong> will be permanently deleted. This cannot be
              undone.
            </p>
            {del.isError && (
              <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Failed to delete project.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => del.mutate(pendingDelete.id)}
                className="btn-sm rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
