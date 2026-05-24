import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';

type Props = {
  id: string;
  title: string;
  project: string;
  points: number;
  pdca: string;
  hours?: number;
  linkedKr?: string | null;
  variant?: 'tray' | 'scheduled';
};

export function TaskBlock({
  id,
  title,
  project,
  points,
  pdca,
  hours,
  linkedKr,
  variant = 'tray',
}: Props) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={title}
      aria-grabbed={isDragging}
      className={clsx(
        'group rounded-xl border bg-white p-2.5 text-xs cursor-grab active:cursor-grabbing transition-shadow',
        variant === 'scheduled'
          ? 'border-brand/30 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
          : 'border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex justify-between gap-2">
        <span className="truncate font-medium text-slate-900">{title}</span>
        <span className="shrink-0 text-[10px] text-slate-500">{project}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="chip-slate h-5 px-1.5 text-[10px]">{pdca}</span>
        <span className="tabular-nums">{points} pt</span>
        {hours !== undefined && <span className="tabular-nums">{hours}h</span>}
        {linkedKr && <span title="Linked KR" className="text-brand">◎</span>}
      </div>
    </div>
  );
}
