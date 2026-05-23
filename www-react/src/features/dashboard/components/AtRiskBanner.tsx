import { Link } from 'react-router-dom';
import type { RiskItem } from '../types';

const HEAD_PREVIEW_COUNT = 2;

export function AtRiskBanner({ items }: { items: RiskItem[] }) {
  if (items.length === 0) return null;
  const head = items.slice(0, HEAD_PREVIEW_COUNT);
  return (
    <div
      role="alert"
      className="rounded-lg border border-risk-red/40 bg-risk-red/10 px-4 py-3 mb-6 flex items-center gap-3"
    >
      <span className="text-risk-red font-semibold text-sm">
        {items.length} {items.length === 1 ? 'project' : 'projects'} at risk
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-300">·</span>
      <ul className="flex gap-4 text-sm">
        {head.map((it) => (
          <li key={it.project_id}>
            <Link to={`/portal/projects/${it.project_id}`} className="underline">
              {it.project_name}
            </Link>{' '}
            <span className="text-slate-500">— {it.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
