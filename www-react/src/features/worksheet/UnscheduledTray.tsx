import { useState } from 'react';
import { TaskBlock } from './TaskBlock';
import type { UnscheduledTask } from './types';

export function UnscheduledTray({ tasks }: { tasks: UnscheduledTask[] }) {
  const [q, setQ] = useState('');
  const filtered = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q.toLowerCase()) ||
      t.project.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <aside className="w-64 border border-slate-200 dark:border-slate-800 rounded p-2 flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search unscheduled…"
        aria-label="Search unscheduled"
        className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
      />
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        Unscheduled · {tasks.length}
      </div>
      <ul className="flex flex-col gap-2 flex-1 overflow-y-auto">
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
        {filtered.length === 0 && <li className="text-xs text-slate-500">No tasks.</li>}
      </ul>
    </aside>
  );
}
