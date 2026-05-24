import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClickOutside } from '@/hooks/useClickOutside';
import { searchBrands, getBrand } from '@/features/brands/brandsApi';
import type { BrandOption } from '@/features/brands/types';

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_STALE_MS = 60_000;

export function BrandPicker({
  id,
  value,
  onChange,
  placeholder = 'Pick brand…',
  allowClear = true,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
    queryKey: ['brand-search', debounced],
    queryFn: () => searchBrands(debounced),
    enabled: open,
    staleTime: SEARCH_STALE_MS,
  });

  const { data: selected } = useQuery({
    queryKey: ['brand-search-single', value],
    queryFn: () => getBrand(value).catch(() => null),
    enabled: !!value,
    staleTime: SEARCH_STALE_MS,
  });

  const display = selected?.brand_name || value || '';

  function pick(opt: BrandOption) {
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
        <span className={display ? 'text-slate-900 truncate flex items-center gap-2' : 'text-slate-400'}>
          {selected?.logo && (
            <img src={selected.logo} alt="" className="h-4 w-4 rounded object-cover" />
          )}
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
            placeholder="Type brand name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {isFetching && (
            <div className="px-2 py-1.5 text-xs text-slate-400">Searching…</div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-400">No brands match.</div>
          )}
          <ul className="space-y-0.5">
            {results.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => pick(b)}
                  className={
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 ' +
                    (b.id === value ? 'bg-slate-50 font-semibold text-brand' : 'text-slate-700')
                  }
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-[10px] font-semibold text-slate-600 overflow-hidden">
                    {b.logo ? (
                      <img src={b.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      b.brand_name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 truncate">{b.brand_name}</span>
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
