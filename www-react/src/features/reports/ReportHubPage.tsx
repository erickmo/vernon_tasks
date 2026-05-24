import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { REPORTS_KEY, listReports } from './reportsApi';
import { BarChartIcon } from '@/components/icons';

export function ReportHubPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: REPORTS_KEY.list,
    queryFn: listReports,
  });

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-rose-600">Failed to load reports.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {today}
          </div>
          <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-slate-900 mt-1">
            Reports
          </h1>
        </div>
      </header>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-14 text-center">
          <BarChartIcon className="mx-auto h-8 w-8 text-slate-300" />
          <div className="mt-2 text-sm text-slate-500">
            No reports available for your role.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((r) => (
            <Link
              key={r.slug}
              to={`/portal/reports/${r.slug}`}
              className="card-hover block p-5 group"
            >
              <div className="text-[15px] font-semibold tracking-tight text-slate-900">
                {r.title}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {r.audience.length > 0 ? r.audience.join(' · ') : 'All users'}
              </div>
              <div className="text-xs font-medium text-brand mt-3 group-hover:translate-x-0.5 transition-transform">
                Open →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
