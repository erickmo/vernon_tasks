import { NavLink } from 'react-router-dom';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import clsx from 'clsx';

type SidebarState = { collapsed: boolean; toggle: () => void };
export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({ collapsed: false, toggle: () => set((s) => ({ collapsed: !s.collapsed })) }),
    { name: 'vernon-sidebar' },
  ),
);

const groups = [
  {
    label: 'WORK',
    items: [
      { to: '/portal/dashboard', label: 'Dashboard', icon: '◎' },
      { to: '/portal/worksheet', label: 'Worksheet', icon: '☷' },
      { to: '/portal/projects',  label: 'Projects',  icon: '▦' },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [{ to: '/portal/reports', label: 'Reports', icon: '∿' }],
  },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  return (
    <aside
      className={clsx(
        'bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className="flex items-center justify-between p-3">
        {!collapsed && <span className="font-semibold text-brand">Vernon</span>}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-xs px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="mt-2">
          {!collapsed && (
            <div className="px-3 text-[10px] font-bold tracking-wider text-slate-500">
              {g.label}
            </div>
          )}
          <ul>
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 text-sm',
                      isActive
                        ? 'bg-brand-subtle text-brand border-l-2 border-brand'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800',
                    )
                  }
                >
                  <span className="w-4 text-center">{it.icon}</span>
                  {!collapsed && <span>{it.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
