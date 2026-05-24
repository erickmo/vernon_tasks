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
    <nav className="flex flex-wrap gap-1">
      {TABS.map((t) => (
        <NavLink
          key={t.slug}
          to={`/portal/projects/${id}/${t.slug}`}
          className={({ isActive }) =>
            clsx(
              'h-8 inline-flex items-center rounded-full px-3.5 text-[13px] font-medium transition',
              isActive
                ? 'bg-brand-subtle text-brand'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
