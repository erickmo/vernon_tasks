import { useQuery } from '@tanstack/react-query';
import { TEAM_WORKSHEET_KEY, getTeamWorksheet } from './worksheetApi';
import clsx from 'clsx';
import { parseISO, format, addDays } from 'date-fns';
import { SectionHead } from '@/components/SectionHead';
import { LockIcon } from '@/components/icons';

const DAY_OVERLOAD_HOURS = 8;
const WEEK_DAYS = 7;

export function TeamView({ weekStart }: { weekStart: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: TEAM_WORKSHEET_KEY(weekStart),
    queryFn: () => getTeamWorksheet(weekStart),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data)
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
        <LockIcon className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">Forbidden or failed to load.</p>
      </div>
    );

  const start = parseISO(weekStart);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) =>
    format(addDays(start, i), 'yyyy-MM-dd'),
  );

  return (
    <div className="card overflow-hidden p-4">
      <SectionHead title="Team capacity" hint="Hours scheduled per day, per member" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2.5 pr-3">Member</th>
              {dates.map((d) => (
                <th key={d} className="py-2.5 px-2 tabular-nums">
                  {format(parseISO(d), 'EEE d')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.user}
                className="border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-0"
              >
                <td className="py-2.5 pr-3 font-medium text-slate-900">{row.full_name}</td>
                {dates.map((d) => {
                  const cell = row.days[d] ?? { hours: 0, task_count: 0 };
                  const overload = cell.hours > DAY_OVERLOAD_HOURS;
                  return (
                    <td
                      key={d}
                      className={clsx(
                        'px-2 py-2.5 tabular-nums',
                        overload ? 'font-semibold text-rose-600' : 'text-slate-700',
                      )}
                    >
                      {cell.hours}h
                      <span className="block text-[10px] text-slate-500">{cell.task_count} t</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
