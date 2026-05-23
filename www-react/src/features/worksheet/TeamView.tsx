import { useQuery } from '@tanstack/react-query';
import { TEAM_WORKSHEET_KEY, getTeamWorksheet } from './worksheetApi';
import clsx from 'clsx';
import { parseISO, format, addDays } from 'date-fns';

const DAY_OVERLOAD_HOURS = 8;
const WEEK_DAYS = 7;

export function TeamView({ weekStart }: { weekStart: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: TEAM_WORKSHEET_KEY(weekStart),
    queryFn: () => getTeamWorksheet(weekStart),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data)
    return <p className="text-sm text-risk-red">Forbidden or failed to load.</p>;

  const start = parseISO(weekStart);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) =>
    format(addDays(start, i), 'yyyy-MM-dd'),
  );

  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2">Member</th>
          {dates.map((d) => (
            <th key={d}>{format(parseISO(d), 'EEE d')}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.user} className="border-b border-slate-100 dark:border-slate-900">
            <td className="py-2">{row.full_name}</td>
            {dates.map((d) => {
              const cell = row.days[d] ?? { hours: 0, task_count: 0 };
              const overload = cell.hours > DAY_OVERLOAD_HOURS;
              return (
                <td key={d} className={clsx(overload && 'text-risk-red font-medium')}>
                  {cell.hours}h
                  <span className="text-[10px] text-slate-500 block">{cell.task_count} t</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
