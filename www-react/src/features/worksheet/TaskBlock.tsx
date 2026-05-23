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
        'rounded border bg-white dark:bg-slate-900 p-2 text-xs cursor-grab active:cursor-grabbing',
        variant === 'scheduled' ? 'border-brand/40' : 'border-slate-200 dark:border-slate-800',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex justify-between gap-2">
        <span className="font-medium truncate">{title}</span>
        <span className="text-[10px] text-slate-500">{project}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="px-1 rounded bg-slate-100 dark:bg-slate-800">{pdca}</span>
        <span>{points} pt</span>
        {hours !== undefined && <span>{hours}h</span>}
        {linkedKr && <span title="Linked KR">◎</span>}
      </div>
    </div>
  );
}
