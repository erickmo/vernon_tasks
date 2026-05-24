import { Link } from 'react-router-dom';
import type { RiskItem } from '../types';

const HEAD_PREVIEW_COUNT = 2;

export function AtRiskBanner({ items }: { items: RiskItem[] }) {
  if (items.length === 0) return null;
  const head = items.slice(0, HEAD_PREVIEW_COUNT);
  return (
    <div
      role="alert"
      className="card border-rose-100 bg-gradient-to-r from-rose-50/80 via-rose-50/40 to-transparent px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      <span className="inline-flex items-center gap-2.5 text-rose-700 font-semibold text-sm">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
        {items.length} {items.length === 1 ? 'project' : 'projects'} at risk
      </span>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {head.map((it) => (
          <li key={it.project_id}>
            <Link
              to={`/portal/projects/${it.project_id}`}
              className="font-medium text-slate-900 hover:text-rose-700 underline-offset-2 hover:underline"
            >
              {it.project_name}
            </Link>{' '}
            <span className="text-slate-500">— {it.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
