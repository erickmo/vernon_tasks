import { Link, useLocation, useParams } from 'react-router-dom';

const LABELS: Record<string, string> = {
  portal: 'Portal',
  dashboard: 'Dashboard',
  projects: 'Projects',
  brands: 'Brands',
  worksheet: 'Worksheet',
  reports: 'Reports',
  tasks: 'Tasks',
  overview: 'Overview',
  burndown: 'Burndown',
  okr: 'OKR',
  members: 'Members',
};

export function Breadcrumb() {
  const { pathname } = useLocation();
  const params = useParams();
  const segs = pathname.split('/').filter(Boolean);

  const crumbs = segs.map((seg, i) => {
    const to = '/' + segs.slice(0, i + 1).join('/');
    const isParamId = params.id && seg === params.id;
    const label = isParamId ? seg : LABELS[seg] ?? seg;
    return { to, label, last: i === segs.length - 1 };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm text-slate-500 min-w-0">
      {crumbs.map((c, i) => (
        <span key={c.to} className="flex items-center min-w-0">
          {i > 0 && <span className="px-2 text-slate-300">/</span>}
          {c.last ? (
            <span className="text-slate-900 font-medium truncate">{c.label}</span>
          ) : (
            <Link to={c.to} className="hover:text-slate-900 truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
