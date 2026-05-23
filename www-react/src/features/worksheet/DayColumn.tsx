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
  return (
    <div
      ref={setNodeRef}
      data-day-date={day.date}
      className={clsx(
        'flex flex-col gap-2 border border-slate-200 dark:border-slate-800 rounded p-2 min-h-[24rem]',
        isOver && 'bg-brand/5 border-brand',
      )}
    >
      <header className="text-xs">
        <div className="font-semibold">{format(dt, 'EEE')}</div>
        <div className="text-slate-500">{format(dt, 'MMM d')}</div>
      </header>
      <ul className="flex flex-col gap-2 flex-1">
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
      </ul>
      <CapacityBar scheduled={day.scheduled_hours} capacity={DAILY_CAPACITY_HOURS} />
    </div>
  );
}
