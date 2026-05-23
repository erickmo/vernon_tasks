import { Link } from 'react-router-dom';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { ProjectListRow } from '../types';

export function ProjectListTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: ProjectListRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2 w-8">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label="Select all"
            />
          </th>
          <th>Name</th>
          <th>Health</th>
          <th>%done</th>
          <th>Days left</th>
          <th>Blocked</th>
          <th>Owner</th>
          <th>Current sprint</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <td className="py-2">
              <input
                type="checkbox"
                aria-label={`Select ${r.name}`}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td>
              <Link to={`/portal/projects/${r.id}`} className="text-brand hover:underline">
                {r.name}
              </Link>
            </td>
            <td>
              <HealthDot bucket={r.health} />
            </td>
            <td>{Math.round(r.percent_done * 100)}%</td>
            <td>{r.days_left ?? '—'}</td>
            <td className={r.blocked_count > 0 ? 'text-risk-red' : ''}>{r.blocked_count}</td>
            <td>{r.owner.name}</td>
            <td>
              {r.current_sprint ? (
                <span>
                  {r.current_sprint.name}{' '}
                  <span className="text-xs text-slate-500">({r.current_sprint.days_left}d)</span>
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
