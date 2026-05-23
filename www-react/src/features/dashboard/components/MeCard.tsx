import { MetricTile } from '@/components/MetricTile';
import type { MeCardData } from '../types';

const CAPACITY_OVER = 1;
const CAPACITY_WARNING = 0.8;
const PERCENT_MULTIPLIER = 100;

function pct(n: number) {
  return `${Math.round(n * PERCENT_MULTIPLIER)}%`;
}

function capacityTone(used: number) {
  if (used > CAPACITY_OVER) return 'danger' as const;
  if (used > CAPACITY_WARNING) return 'warning' as const;
  return 'neutral' as const;
}

export function MeCard({ data }: { data: MeCardData }) {
  return (
    <section aria-label="Me">
      <h2 className="text-sm font-semibold mb-3">Me</h2>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Points (7d)" value={data.points_week} />
        <MetricTile label="Streak" value={`${data.streak_days}d`} />
        <MetricTile
          label="Capacity used"
          value={pct(data.capacity_used_pct)}
          tone={capacityTone(data.capacity_used_pct)}
        />
        <MetricTile label="On-time 7d" value={pct(data.ontime_rate_7d)} />
      </div>
    </section>
  );
}
