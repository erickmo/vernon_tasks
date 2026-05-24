import { SprintCard } from './SprintCard';
import { SectionHead } from '@/components/SectionHead';
import { FlagIcon } from '@/components/icons';
import type { SprintCardData } from '../types';

export function SprintsScroller({ sprints }: { sprints: SprintCardData[] }) {
  if (sprints.length === 0) {
    return (
      <section aria-label="My active sprints">
        <SectionHead title="My Active Sprints" />
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
          <FlagIcon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No active sprints.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="My active sprints">
      <SectionHead title="My Active Sprints" hint={`${sprints.length} running`} />
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {sprints.map((s) => (
          <div key={s.id} className="snap-start">
            <SprintCard sprint={s} />
          </div>
        ))}
      </div>
    </section>
  );
}
