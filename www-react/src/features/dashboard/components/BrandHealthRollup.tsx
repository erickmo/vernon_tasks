import { useQuery } from '@tanstack/react-query';
import { BRAND_HEALTH_KEY, fetchBrandHealth, type BrandHealthRow } from '../brandHealthApi';

const STALE_TIME_MS = 60_000;

function scoreTone(score: number): string {
  if (score >= 75) return 'text-emerald-700 bg-emerald-50 ring-emerald-100';
  if (score >= 50) return 'text-amber-700 bg-amber-50 ring-amber-100';
  return 'text-rose-700 bg-rose-50 ring-rose-100';
}

function MetricCell({ value, suffix = '%' }: { value: number; suffix?: string }) {
  return (
    <span className="tabular-nums text-slate-700">
      {value.toFixed(1)}
      <span className="text-[10px] text-slate-400 ml-0.5">{suffix}</span>
    </span>
  );
}

function Row({ row }: { row: BrandHealthRow }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2.5 px-3 font-medium text-slate-800">{row.brand_name}</td>
      <td className="py-2.5 px-3">
        <span
          className={
            'inline-flex h-7 min-w-[3.25rem] items-center justify-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset tabular-nums ' +
            scoreTone(row.score)
          }
        >
          {row.score.toFixed(1)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs"><MetricCell value={row.okr_pct} /></td>
      <td className="py-2.5 px-3 text-xs"><MetricCell value={row.ontime_pct} /></td>
      <td className="py-2.5 px-3 text-xs"><MetricCell value={row.velocity_health} /></td>
    </tr>
  );
}

export function BrandHealthRollup() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: BRAND_HEALTH_KEY,
    queryFn: fetchBrandHealth,
    staleTime: STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <section className="card p-5 space-y-3 animate-pulse">
        <div className="h-4 w-40 bg-slate-200 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="card border-rose-100 bg-rose-50/60 px-5 py-4 text-sm text-rose-700">
        <span className="font-semibold">Brand Health gagal dimuat.</span> {String(error)}
      </section>
    );
  }

  const rows = data ?? [];
  const sorted = [...rows].sort((a, b) => b.score - a.score);

  return (
    <section className="card p-5">
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Brand Health</h2>
          <p className="text-xs text-slate-500">
            Composite: OKR · {(rows[0]?.breakdown.okr_weight ?? 0.5) * 100}% ·
            On-time · {(rows[0]?.breakdown.ontime_weight ?? 0.3) * 100}% ·
            Velocity · {(rows[0]?.breakdown.velocity_weight ?? 0.2) * 100}%
          </p>
        </div>
        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{rows.length} brand</span>
      </header>
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Belum ada brand.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 px-3 text-left font-medium">Brand</th>
                <th className="py-2 px-3 text-left font-medium">Score</th>
                <th className="py-2 px-3 text-left font-medium">OKR</th>
                <th className="py-2 px-3 text-left font-medium">On-time</th>
                <th className="py-2 px-3 text-left font-medium">Velocity</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <Row key={r.brand} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
