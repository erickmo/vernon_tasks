import { useNavigate } from 'react-router-dom';
import { MetricTile } from '@/components/MetricTile';
import type { TodayCardData } from '../types';

const ONTIME_POSITIVE = 0.8;
const ONTIME_WARNING = 0.7;
const BLOCKED_WARNING_MAX = 2;
const PERCENT_MULTIPLIER = 100;

function pct(n: number) {
  return `${Math.round(n * PERCENT_MULTIPLIER)}%`;
}

function ontimeTone(rate: number) {
  if (rate >= ONTIME_POSITIVE) return 'positive' as const;
  if (rate >= ONTIME_WARNING) return 'warning' as const;
  return 'danger' as const;
}

function blockedTone(count: number) {
  if (count === 0) return 'positive' as const;
  if (count <= BLOCKED_WARNING_MAX) return 'warning' as const;
  return 'danger' as const;
}

export function TodayCard({ data }: { data: TodayCardData }) {
  const nav = useNavigate();
  const ontime = ontimeTone(data.ontime_rate_7d);
  const blocked = blockedTone(data.blocked_count);
  const okrTone = data.okr_confidence_delta_wow >= 0 ? 'positive' : 'warning';

  if (data.org_health_score !== undefined) {
    return (
      <section aria-label="Today">
        <h2 className="text-sm font-semibold mb-3">Today</h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricTile label="Org Health Score" value={Math.round(data.org_health_score)} />
          <MetricTile label="On-time 7d" value={pct(data.ontime_rate_7d)} tone={ontime} />
          <MetricTile
            label="Blocked"
            value={data.blocked_count}
            tone={blocked}
            onClick={() => nav('/portal/projects?filter=has-blockers')}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Today">
      <h2 className="text-sm font-semibold mb-3">Today</h2>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile
          label="On-time 7d"
          value={pct(data.ontime_rate_7d)}
          tone={ontime}
          hint={data.next_deadline ? `Next: ${data.next_deadline.title}` : undefined}
        />
        <MetricTile
          label="Blocked"
          value={data.blocked_count}
          tone={blocked}
          onClick={() => nav('/portal/projects?filter=has-blockers')}
        />
        <MetricTile
          label="OKR Δ WoW"
          value={pct(Math.abs(data.okr_confidence_delta_wow))}
          hint={data.okr_confidence_delta_wow >= 0 ? '↑ improving' : '↓ slipping'}
          tone={okrTone}
        />
      </div>
    </section>
  );
}
