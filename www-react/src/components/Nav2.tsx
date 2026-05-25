import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const ITEMS = [
  { to: '/portal/dashboard', label: 'Dashboard' },
  { to: '/portal/worksheet', label: 'Worksheet' },
  { to: '/portal/projects', label: 'Projects' },
  { to: '/portal/brands', label: 'Brands' },
  { to: '/portal/strategy', label: 'Strategy' },
  { to: '/portal/reports', label: 'Reports' },
];

export function Nav2({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <nav className="h-14 flex items-center gap-2 px-6 lg:px-8 bg-white border-b border-slate-100 sticky top-16 z-20">
      <ul className="flex items-center gap-1">
        {ITEMS.map((it) => (
          <li key={it.to}>
            <NavLink
              to={it.to}
              className={({ isActive }) =>
                clsx(
                  'inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-all',
                  isActive
                    ? 'bg-brand-subtle text-brand shadow-[inset_0_0_0_1px_rgba(104,54,160,0.12)]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <button
        onClick={onOpenPalette}
        className="ml-auto flex items-center gap-2 h-9 pl-3.5 pr-2 rounded-full border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-slate-300 hover:shadow-sm transition text-[13px] text-slate-500 hover:text-slate-700"
        aria-label="Open command palette"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <span>Cari…</span>
        <kbd className="ml-2 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono text-slate-500 shadow-sm">
          ⌘K
        </kbd>
      </button>
    </nav>
  );
}
