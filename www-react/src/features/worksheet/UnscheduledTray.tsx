import { useState } from 'react';
import { TaskBlock } from './TaskBlock';
import { SparklesIcon } from '@/components/icons';
import type { UnscheduledTask } from './types';

export function UnscheduledTray({ tasks }: { tasks: UnscheduledTask[] }) {
  const [q, setQ] = useState('');
  const filtered = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q.toLowerCase()) ||
      t.project.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <aside className="card flex w-64 h-full flex-col gap-3 p-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search unscheduled…"
        aria-label="Search unscheduled"
        className="input h-9 text-[13px]"
      />
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span>Unscheduled</span>
        <span className="chip-slate">{tasks.length}</span>
      </div>
      <ul className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
        {filtered.map((t) => (
          <li key={t.task_id}>
            <TaskBlock
              id={`task:${t.task_id}`}
              title={t.title}
              project={t.project}
              points={t.points}
              pdca={t.pdca}
              linkedKr={t.linked_kr}
            />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center">
            <SparklesIcon className="h-6 w-6 text-slate-300" />
            <span className="text-xs text-slate-500">All caught up — no tasks.</span>
          </li>
        )}
      </ul>
    </aside>
  );
}
