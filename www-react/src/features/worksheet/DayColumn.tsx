import { useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import { TaskBlock } from './TaskBlock';
import { CapacityBar } from './CapacityBar';
import type { WorksheetDay } from './types';

const DAILY_CAPACITY_HOURS = 8;

export function DayColumn({ day }: { day: WorksheetDay }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.date}` });
  const dt = parseISO(day.date);
  const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
  return (
    <div
      ref={setNodeRef}
      data-day-date={day.date}
      className={clsx(
        'card flex h-full min-h-[24rem] flex-col gap-2 p-3 transition-colors',
        isOver && 'border-brand bg-brand-subtle/40',
      )}
    >
      <header className="text-xs">
        <div
          className={clsx(
            'font-semibold tracking-tight',
            isToday ? 'text-brand' : 'text-slate-900',
          )}
        >
          {format(dt, 'EEE')}
        </div>
        <div className="text-slate-500 tabular-nums">{format(dt, 'MMM d')}</div>
      </header>
      <ul className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
        {day.entries.map((e) => (
          <li key={e.id}>
            <TaskBlock
              id={`entry:${e.id}`}
              title={e.title}
              project={e.project}
              points={e.points}
              pdca={e.pdca}
              hours={e.hours_planned}
              linkedKr={e.linked_kr}
              variant="scheduled"
            />
          </li>
        ))}
        {day.entries.length === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
            Drop tasks here
          </li>
        )}
      </ul>
      <CapacityBar scheduled={day.scheduled_hours} capacity={DAILY_CAPACITY_HOURS} />
    </div>
  );
}
