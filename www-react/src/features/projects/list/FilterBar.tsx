import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { BrandPicker } from '@/components/BrandPicker';
import type { ProjectListFilters } from '../types';

const CHIPS: { key: keyof ProjectListFilters; label: string }[] = [
  { key: 'mine', label: 'My projects' },
  { key: 'active', label: 'Status ≠ done' },
  { key: 'has_blockers', label: 'Has blockers' },
  { key: 'sprint_active', label: 'Sprint active' },
  { key: 'risk_high', label: 'Risk high' },
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-72">
        <input
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
      </div>
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
              'h-8 px-3 rounded-full text-[13px] font-medium transition',
              active
                ? 'bg-brand-subtle text-brand'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {c.label}
          </button>
        );
      })}
      <div className="w-52">
        <BrandPicker
          value={value.brand ?? ''}
          onChange={(v) => onChange({ ...value, brand: v || undefined })}
          placeholder="Filter by brand…"
        />
      </div>
      <select
        value={value.sort ?? ''}
        onChange={(e) =>
          onChange({
            ...value,
            sort: (e.target.value || undefined) as ProjectListFilters['sort'],
          })
        }
        className="input ml-auto h-8 w-auto px-3 text-[13px]"
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
