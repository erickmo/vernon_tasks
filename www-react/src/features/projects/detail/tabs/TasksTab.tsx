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
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-slate-500">Group by</span>
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => set(o.key)}
            className={clsx(
              'text-xs px-2 py-1 rounded border',
              group === o.key
                ? 'bg-brand text-white border-brand'
                : 'border-slate-300 dark:border-slate-700 text-slate-600',
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

      {isLoading && <p className="text-sm text-slate-500">Loading tasks…</p>}
      {isError && <p className="text-sm text-risk-red">Failed to load tasks.</p>}
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
    <section className="mb-6">
      <header className="flex items-baseline gap-3 mb-2">
        <h3 className="font-semibold text-sm">{bucket.label}</h3>
        <span className="text-xs text-slate-500">{bucket.tasks.length} tasks</span>
        {bucket.meta?.target !== undefined && (
          <div className="flex-1 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden max-w-xs">
            <div
              className="h-full bg-brand"
              style={{ width: `${Math.round((bucket.meta.progress ?? 0) * 100)}%` }}
            />
          </div>
        )}
      </header>
      <ul className="border border-slate-200 dark:border-slate-800 rounded divide-y divide-slate-100 dark:divide-slate-900">
        {bucket.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              aria-label={`Select ${t.title}`}
              checked={selected.has(t.id)}
              onChange={() => onToggle(t.id)}
            />
            <span
              className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold', {
                'bg-slate-200 text-slate-700': t.pdca === 'BACKLOG',
                'bg-blue-100 text-blue-700': t.pdca === 'PLAN',
                'bg-amber-100 text-amber-700': t.pdca === 'DO',
                'bg-purple-100 text-purple-700': t.pdca === 'CHECK',
                'bg-green-100 text-green-700': t.pdca === 'DONE' || t.pdca === 'ACT',
              })}
            >
              {t.pdca}
            </span>
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-xs text-slate-500">{t.assignee ?? '—'}</span>
            <span className="text-xs text-slate-500">{t.due_date ?? '—'}</span>
            <span className="text-xs">{t.points} pt</span>
            {t.risk_flag && (
              <span className="text-xs text-risk-red" title={t.risk_flag}>
                ⚠
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
