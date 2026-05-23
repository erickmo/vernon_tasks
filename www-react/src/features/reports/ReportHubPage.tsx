import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { REPORTS_KEY, listReports } from './reportsApi';

export function ReportHubPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: REPORTS_KEY.list,
    queryFn: listReports,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-red-600">Failed to load reports.</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Reports</h1>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">
          No reports available for your role.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((r) => (
            <Link
              key={r.slug}
              to={`/portal/reports/${r.slug}`}
              className="block border border-slate-200 dark:border-slate-800 rounded p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-slate-500 mt-1">
                {r.audience.length > 0 ? r.audience.join(' · ') : 'All users'}
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                Open →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
