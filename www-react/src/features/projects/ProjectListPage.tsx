import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FilterBar } from './list/FilterBar';
import { ProjectListTable } from './list/ProjectListTable';
import { KEY, listProjects } from './projectsApi';
import type { ProjectListFilters } from './types';

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

export function ProjectListPage() {
  const { value: filters, set: setFilters } = useFilterStore();
  const { data, isLoading, isError } = useQuery({
    queryKey: KEY.list(filters),
    queryFn: () => listProjects(filters),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Projects</h1>
      <FilterBar value={filters} onChange={setFilters} />
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-risk-red">Failed to load projects.</p>}
      {data && (
        <ProjectListTable
          rows={data}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}
    </div>
  );
}
