import { SprintCard } from './SprintCard';
import type { SprintCardData } from '../types';

export function SprintsScroller({ sprints }: { sprints: SprintCardData[] }) {
  if (sprints.length === 0) {
    return <p className="text-sm text-slate-500">No active sprints.</p>;
  }
  return (
    <section aria-label="My active sprints">
      <h2 className="text-sm font-semibold mb-3">My Active Sprints</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sprints.map((s) => (
          <SprintCard key={s.id} sprint={s} />
        ))}
      </div>
    </section>
  );
}
