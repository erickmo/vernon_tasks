import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { addDays, parseISO, format } from 'date-fns';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  WORKSHEET_KEY,
  getWorksheet,
  scheduleTask,
  updateEntry,
  unschedule,
} from './worksheetApi';
import { thisMondayISO, WeekHeader } from './WeekHeader';
import { WeekGrid } from './WeekGrid';
import { UnscheduledTray } from './UnscheduledTray';
import { FridayReviewBanner } from './FridayReviewBanner';
import { TeamView } from './TeamView';
import { useSession } from '@/features/auth/useSession';
import type { Worksheet } from './types';

const DEFAULT_HOUR_START = 8;
const DEFAULT_HOURS = 1;
const UNDO_DURATION_MS = 5000;
const LEADER_ROLES = ['Vernon Leader', 'Vernon PM'];

export function WorksheetPage() {
  const [weekStart, setWeekStart] = useState<string>(thisMondayISO());
  const [view, setView] = useState<'week' | 'today' | 'next'>('week');
  const [tab, setTab] = useState<'personal' | 'team'>('personal');
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const { data: session } = useSession();
  const canSeeTeam = !!session?.roles?.some((r) => LEADER_ROLES.includes(r));

  const { data, isLoading, isError } = useQuery({
    queryKey: WORKSHEET_KEY(weekStart),
    queryFn: () => getWorksheet(weekStart),
  });

  const scheduleM = useMutation({
    mutationFn: scheduleTask,
    onMutate: async ({ task_id, date }) => {
      await qc.cancelQueries({ queryKey: WORKSHEET_KEY(weekStart) });
      const prev = qc.getQueryData<Worksheet>(WORKSHEET_KEY(weekStart));
      if (!prev) return { prev };
      const t = prev.unscheduled.find((u) => u.task_id === task_id);
      if (!t) return { prev };
      const optimisticEntry = {
        id: `tmp-${task_id}-${date}`,
        task_id,
        title: t.title,
        project: t.project,
        pdca: t.pdca,
        points: t.points,
        linked_kr: t.linked_kr,
        hour_start: DEFAULT_HOUR_START,
        hours_planned: DEFAULT_HOURS,
      };
      const next: Worksheet = {
        ...prev,
        unscheduled: prev.unscheduled.filter((u) => u.task_id !== task_id),
        days: prev.days.map((d) =>
          d.date === date
            ? {
                ...d,
                entries: [...d.entries, optimisticEntry],
                scheduled_hours: d.scheduled_hours + DEFAULT_HOURS,
              }
            : d,
        ),
      };
      qc.setQueryData(WORKSHEET_KEY(weekStart), next);
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKSHEET_KEY(weekStart), ctx.prev);
      toast.error('Failed to schedule task');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) }),
  });

  const moveM = useMutation({
    mutationFn: ({ entry_id, date }: { entry_id: string; date: string }) =>
      updateEntry(entry_id, { date }),
    onSettled: () => qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) }),
  });

  function onDragEnd(e: DragEndEvent) {
    const dragId = String(e.active.id);
    const dropId = e.over?.id ? String(e.over.id) : null;
    if (!dropId || !dropId.startsWith('day:')) return;
    const date = dropId.slice(4);

    if (dragId.startsWith('task:')) {
      const taskId = dragId.slice(5);
      scheduleM.mutate({
        task_id: taskId,
        date,
        hour_start: DEFAULT_HOUR_START,
        hours: DEFAULT_HOURS,
      });
      toast('Scheduled', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const ws = qc.getQueryData<Worksheet>(WORKSHEET_KEY(weekStart));
            const entry = ws?.days
              .find((d) => d.date === date)
              ?.entries.find((en) => en.task_id === taskId);
            if (entry && !entry.id.startsWith('tmp-')) await unschedule(entry.id);
            qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) });
          },
        },
        duration: UNDO_DURATION_MS,
      });
    } else if (dragId.startsWith('entry:')) {
      const entryId = dragId.slice(6);
      moveM.mutate({ entry_id: entryId, date });
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data)
    return <p className="text-sm text-risk-red">Failed to load worksheet.</p>;

  const capacityUsedPct = data.capacity_hours
    ? data.days.reduce((sum, d) => sum + d.scheduled_hours, 0) / data.capacity_hours
    : 0;

  const visibleDays =
    view === 'today'
      ? data.days.filter((d) => d.date === format(new Date(), 'yyyy-MM-dd'))
      : data.days;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <WeekHeader
        weekStart={weekStart}
        capacityHours={data.capacity_hours}
        capacityUsedPct={capacityUsedPct}
        onPrev={() => setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'))}
        onNext={() => setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))}
        onToday={() => setWeekStart(thisMondayISO())}
        view={view}
        onViewChange={setView}
      />
      {canSeeTeam && (
        <div className="flex justify-end mb-2">
          <div className="inline-flex border border-slate-300 dark:border-slate-700 rounded">
            <button
              onClick={() => setTab('personal')}
              className={clsx('px-3 py-1 text-xs', tab === 'personal' ? 'bg-brand text-white' : '')}
            >
              Personal
            </button>
            <button
              onClick={() => setTab('team')}
              className={clsx('px-3 py-1 text-xs', tab === 'team' ? 'bg-brand text-white' : '')}
            >
              Team
            </button>
          </div>
        </div>
      )}
      <FridayReviewBanner weekStart={weekStart} />
      {tab === 'team' && canSeeTeam ? (
        <TeamView weekStart={weekStart} />
      ) : (
        <div className="flex gap-3">
          <UnscheduledTray tasks={data.unscheduled} />
          <div className="flex-1">
            <WeekGrid days={visibleDays} />
          </div>
        </div>
      )}
    </DndContext>
  );
}
