import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KEY, getProjectTasks } from '../../projectsApi';
import type { GroupBy, TaskBucket } from '../../types';
import { BulkActionBar } from '../../list/BulkActionBar';
import { BulkMoveSprintModal } from '../modals/BulkMoveSprintModal';
import { BulkReassignModal } from '../modals/BulkReassignModal';
import { BulkPhaseShiftModal } from '../modals/BulkPhaseShiftModal';
import { CheckCircleIcon, AlertTriangleIcon } from '@/components/icons';

const OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'kr', label: 'OKR/KR' },
  { key: 'pdca', label: 'PDCA' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due', label: 'Due' },
];

type GroupStore = { group: GroupBy; set: (g: GroupBy) => void };
const useGroup = create<GroupStore>()(
  persist((set) => ({ group: 'kr' as GroupBy, set: (g) => set({ group: g }) }), {
    name: 'vernon-tasks-group',
  }),
);

export function TasksTab() {
  const { id } = useParams<{ id: string }>();
  const { group, set } = useGroup();
  const { data, isLoading, isError } = useQuery({
    queryKey: id ? KEY.tasks(id, group) : ['project', 'noop'],
    queryFn: () => getProjectTasks(id!, group),
    enabled: !!id,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | 'move' | 'reassign' | 'phase'>(null);

  function toggle(taskId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }
  const clear = () => setSelected(new Set());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          Group by
        </span>
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => set(o.key)}
            className={clsx(
              'h-8 px-3 rounded-full text-[13px] font-medium transition',
              group === o.key
                ? 'bg-brand-subtle text-brand'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <BulkActionBar
        count={selected.size}
        onClear={clear}
        onMoveSprint={() => setModal('move')}
        onReassign={() => setModal('reassign')}
        onPhaseShift={() => setModal('phase')}
      />

      {isLoading && (
        <div className="card p-8 text-center text-sm text-slate-500">Loading tasks…</div>
      )}
      {isError && (
        <div className="card p-8 text-center text-sm text-rose-600">Failed to load tasks.</div>
      )}
      {data && data.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
          <CheckCircleIcon className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No tasks in this view.</p>
        </div>
      )}
      {data &&
        data.map((bucket) => (
          <BucketBlock
            key={bucket.key}
            bucket={bucket}
            selected={selected}
            onToggle={toggle}
          />
        ))}

      <BulkMoveSprintModal
        open={modal === 'move'}
        taskIds={[...selected]}
        sprints={[]}
        onClose={() => {
          setModal(null);
          clear();
        }}
      />
      <BulkReassignModal
        open={modal === 'reassign'}
        taskIds={[...selected]}
        candidates={[]}
        onClose={() => {
          setModal(null);
          clear();
        }}
      />
      <BulkPhaseShiftModal
        open={modal === 'phase'}
        taskIds={[...selected]}
        onClose={() => {
          setModal(null);
          clear();
        }}
      />
    </div>
  );
}

const PDCA_CHIP: Record<string, string> = {
  BACKLOG: 'chip-slate',
  PLAN: 'chip-brand',
  DO: 'chip-amber',
  CHECK: 'chip-brand',
  DONE: 'chip-green',
  ACT: 'chip-green',
};

function BucketBlock({
  bucket,
  selected,
  onToggle,
}: {
  bucket: TaskBucket;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="card p-5">
      <header className="flex items-center gap-3 mb-3">
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">
          {bucket.label}
        </h3>
        <span className="chip-slate tabular-nums">{bucket.tasks.length}</span>
        {bucket.meta?.target !== undefined && (
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden max-w-xs">
            <div
              className="h-full bg-gradient-to-r from-brand to-brand-hover"
              style={{ width: `${Math.round((bucket.meta.progress ?? 0) * 100)}%` }}
            />
          </div>
        )}
      </header>
      <ul className="divide-y divide-slate-100">
        {bucket.tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50/60 rounded-lg px-2 -mx-2 transition-colors"
          >
            <input
              type="checkbox"
              aria-label={`Select ${t.title}`}
              checked={selected.has(t.id)}
              onChange={() => onToggle(t.id)}
            />
            <span className={PDCA_CHIP[t.pdca] ?? 'chip-slate'}>{t.pdca}</span>
            <span className="flex-1 truncate text-slate-800">{t.title}</span>
            <span className="text-xs text-slate-500">{t.assignee ?? '—'}</span>
            <span className="text-xs text-slate-500 tabular-nums">{t.due_date ?? '—'}</span>
            <span className="text-xs text-slate-700 tabular-nums">{t.points} pt</span>
            {t.risk_flag && (
              <AlertTriangleIcon className="h-3.5 w-3.5 text-rose-500" aria-label={t.risk_flag}>
                <title>{t.risk_flag}</title>
              </AlertTriangleIcon>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
