import { NavLink, useParams } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { slug: 'tasks', label: 'Tasks' },
  { slug: 'overview', label: 'Overview' },
  { slug: 'burndown', label: 'Burndown' },
  { slug: 'okr', label: 'OKR' },
  { slug: 'members', label: 'Members' },
];

export function TabsNav() {
  const { id } = useParams<{ id: string }>();
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-4">
      {TABS.map((t) => (
        <NavLink
          key={t.slug}
          to={`/portal/projects/${id}/${t.slug}`}
          className={({ isActive }) =>
            clsx(
              'px-3 py-2 text-sm border-b-2 -mb-px',
              isActive
                ? 'border-brand text-brand'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
