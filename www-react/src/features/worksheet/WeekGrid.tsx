import { DayColumn } from './DayColumn';
import type { WorksheetDay } from './types';

export function WeekGrid({ days }: { days: WorksheetDay[] }) {
  return (
    <div className="grid grid-cols-7 gap-3 h-full">
      {days.map((d) => (
        <DayColumn key={d.date} day={d} />
      ))}
    </div>
  );
}
