import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ProjectListFilters } from '../types';

const CHIPS: { key: keyof ProjectListFilters; label: string }[] = [
  { key: 'mine', label: 'My projects' },
  { key: 'active', label: 'Status≠done' },
  { key: 'has_blockers', label: 'Has-blockers' },
  { key: 'sprint_active', label: 'Sprint=active' },
  { key: 'risk_high', label: 'Risk=high' },
];

const SORTS: { key: NonNullable<ProjectListFilters['sort']>; label: string }[] = [
  { key: 'health_asc', label: 'Health ↑' },
  { key: 'days_left_asc', label: 'Days left ↑' },
  { key: 'blocked_desc', label: 'Blocked ↓' },
];

export function FilterBar({
  value,
  onChange,
}: {
  value: ProjectListFilters;
  onChange: (next: ProjectListFilters) => void;
}) {
  const [search, setSearch] = useState(value.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...value, search: search || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input
        placeholder="Search projects…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
      />
      {CHIPS.map((c) => {
        const active = Boolean(value[c.key]);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              const next = { ...value };
              if (active) {
                delete next[c.key];
              } else {
                (next as Record<string, unknown>)[c.key] = true;
              }
              onChange(next);
            }}
            className={clsx(
              'text-xs px-3 py-1 rounded-full border',
              active
                ? 'bg-brand text-white border-brand'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300',
            )}
          >
            {c.label}
          </button>
        );
      })}
      <select
        value={value.sort ?? ''}
        onChange={(e) =>
          onChange({
            ...value,
            sort: (e.target.value || undefined) as ProjectListFilters['sort'],
          })
        }
        className="ml-auto text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
      >
        <option value="">Sort…</option>
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
