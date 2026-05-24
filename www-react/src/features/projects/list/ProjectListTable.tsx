import { Link } from 'react-router-dom';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { ProjectListRow } from '../types';

export function ProjectListTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  canEdit = false,
  canDelete = false,
  onEdit,
  onDelete,
}: {
  rows: ProjectListRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (row: ProjectListRow) => void;
  onDelete?: (row: ProjectListRow) => void;
}) {
  const showActions = canEdit || canDelete;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
        <tr className="border-b border-slate-100">
          <th className="px-4 py-3 w-8">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label="Select all"
            />
          </th>
          <th className="py-3 font-medium">Name</th>
          <th className="py-3 font-medium">Brand</th>
          <th className="py-3 font-medium">Health</th>
          <th className="py-3 font-medium">% done</th>
          <th className="py-3 font-medium">Days left</th>
          <th className="py-3 font-medium">Blocked</th>
          <th className="py-3 font-medium">Owner</th>
          <th className="py-3 font-medium pr-4">Current sprint</th>
          {showActions && <th className="py-3 font-medium pr-4 text-right">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors"
          >
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Select ${r.name}`}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td className="py-3">
              <Link
                to={`/portal/projects/${r.id}`}
                className="font-medium text-slate-900 hover:text-brand"
              >
                {r.name}
              </Link>
            </td>
            <td className="py-3 text-slate-600">
              {r.brand ? (
                <span className="chip-slate">{r.brand}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className="py-3">
              <HealthDot bucket={r.health} />
            </td>
            <td className="py-3 tabular-nums">{Math.round(r.percent_done * 100)}%</td>
            <td className="py-3 tabular-nums">{r.days_left ?? '—'}</td>
            <td className="py-3 tabular-nums">
              {r.blocked_count > 0 ? (
                <span className="chip-red">{r.blocked_count}</span>
              ) : (
                <span className="text-slate-400">0</span>
              )}
            </td>
            <td className="py-3 text-slate-600">{r.owner.name}</td>
            <td className="py-3 pr-4">
              {r.current_sprint ? (
                <span className="text-slate-700">
                  {r.current_sprint.name}{' '}
                  <span className="text-xs text-slate-500 tabular-nums">
                    ({r.current_sprint.days_left}d)
                  </span>
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            {showActions && (
              <td className="py-3 pr-4 text-right whitespace-nowrap">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit?.(r)}
                    className="text-xs font-medium text-brand hover:underline mr-3"
                    aria-label={`Edit ${r.name}`}
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete?.(r)}
                    className="text-xs font-medium text-rose-600 hover:underline"
                    aria-label={`Delete ${r.name}`}
                  >
                    Delete
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
