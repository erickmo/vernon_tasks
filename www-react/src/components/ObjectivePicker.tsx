import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClickOutside } from '@/hooks/useClickOutside';
import { api } from '@/lib/api';

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_STALE_MS = 60_000;
const RESOURCE = '/api/resource/Objective';
const FIELDS = JSON.stringify(['name', 'title', 'brand']);
const SEARCH_LIMIT = 20;

type ObjectiveRow = { name: string; title: string; brand?: string };
type ObjectiveOption = { id: string; title: string; brand?: string };

async function searchObjectives(query = '', brand = ''): Promise<ObjectiveOption[]> {
  const params: Record<string, string | number> = {
    fields: FIELDS,
    order_by: 'modified desc',
    limit_page_length: SEARCH_LIMIT,
  };
  const filters: any[] = [];
  if (brand) filters.push(['brand', '=', brand]);
  if (filters.length) params.filters = JSON.stringify(filters);
  const q = query.trim();
  if (q) {
    params.or_filters = JSON.stringify([
      ['title', 'like', `%${q}%`],
      ['name', 'like', `%${q}%`],
    ]);
  }
  const res = await api.get<{ data: ObjectiveRow[] }>(RESOURCE, { params });
  return (res.data.data ?? []).map((r) => ({ id: r.name, title: r.title, brand: r.brand }));
}

async function getObjective(id: string): Promise<ObjectiveOption | null> {
  try {
    const res = await api.get<{ data: ObjectiveRow }>(
      `${RESOURCE}/${encodeURIComponent(id)}`,
    );
    return {
      id: res.data.data.name,
      title: res.data.data.title,
      brand: res.data.data.brand,
    };
  } catch {
    return null;
  }
}

export function ObjectivePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick objective…',
  allowClear = true,
  disabled = false,
  brand = '',
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  brand?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['objective-search', debounced, brand],
    queryFn: () => searchObjectives(debounced, brand),
    enabled: open,
    staleTime: SEARCH_STALE_MS,
  });

  const { data: selected } = useQuery({
    queryKey: ['objective-single', value],
    queryFn: () => getObjective(value),
    enabled: !!value,
    staleTime: SEARCH_STALE_MS,
  });

  const display = selected?.title || value || '';

  function pick(opt: ObjectiveOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="input flex items-center justify-between text-left disabled:opacity-60"
      >
        <span className={display ? 'text-slate-900 truncate' : 'text-slate-400'}>
          {display || placeholder}
        </span>
        <svg
          className="h-4 w-4 text-slate-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="menu absolute z-50 mt-2 w-full p-2 max-h-72 overflow-auto">
          <input
            ref={inputRef}
            type="search"
            className="input mb-2 w-full"
            placeholder="Type objective title or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {isFetching && (
            <div className="px-2 py-1.5 text-xs text-slate-400">Searching…</div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-400">No objectives match.</div>
          )}
          <ul className="space-y-0.5">
            {results.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => pick(o)}
                  className={
                    'w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 ' +
                    (o.id === value ? 'bg-slate-50 font-semibold text-brand' : 'text-slate-700')
                  }
                >
                  <span className="truncate w-full">{o.title || o.id}</span>
                  <span className="text-[10px] text-slate-400">{o.id}</span>
                </button>
              </li>
            ))}
          </ul>
          {allowClear && value && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
