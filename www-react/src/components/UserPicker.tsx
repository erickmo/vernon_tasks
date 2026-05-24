import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClickOutside } from '@/hooks/useClickOutside';
import { searchUsers } from '@/features/projects/projectsApi';
import type { UserOption } from '@/features/projects/types';

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_STALE_MS = 60_000;
const EXCLUDE_EMPTY: string[] = [];

export function UserPicker({
  id,
  value,
  onChange,
  placeholder = 'Search user…',
  exclude = EXCLUDE_EMPTY,
  allowClear = true,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  exclude?: string[];
  allowClear?: boolean;
  disabled?: boolean;
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
    queryKey: ['user-search', debounced],
    queryFn: () => searchUsers(debounced),
    enabled: open,
    staleTime: SEARCH_STALE_MS,
  });

  const { data: selectedUser } = useQuery({
    queryKey: ['user-search-single', value],
    queryFn: () => searchUsers(value, 1).then((rows) => rows.find((r) => r.user === value) ?? null),
    enabled: !!value,
    staleTime: SEARCH_STALE_MS,
  });

  const display = selectedUser?.full_name || value || '';
  const filtered = results.filter((r) => !exclude.includes(r.user));

  function pick(opt: UserOption) {
    onChange(opt.user);
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
            placeholder="Type name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {isFetching && (
            <div className="px-2 py-1.5 text-xs text-slate-400">Searching…</div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-400">No matches.</div>
          )}
          <ul className="space-y-0.5">
            {filtered.map((u) => (
              <li key={u.user}>
                <button
                  type="button"
                  onClick={() => pick(u)}
                  className={
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 ' +
                    (u.user === value ? 'bg-slate-50 font-semibold text-brand' : 'text-slate-700')
                  }
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 overflow-hidden">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (u.full_name || u.user).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="block truncate">{u.full_name || u.user}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{u.email}</span>
                  </span>
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
