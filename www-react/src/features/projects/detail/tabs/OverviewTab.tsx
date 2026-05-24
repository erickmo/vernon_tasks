import { useOutletContext } from 'react-router-dom';
import { SectionHead } from '@/components/SectionHead';
import type { ProjectDetail } from '../../types';

export function OverviewTab() {
  const project = useOutletContext<ProjectDetail>();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="card lg:col-span-2 p-5">
        <SectionHead title="Burndown" />
        <p className="text-sm text-slate-500">
          See{' '}
          <a
            href={`/portal/projects/${project.id}/burndown`}
            className="text-brand hover:underline"
          >
            Burndown tab
          </a>{' '}
          for full chart.
        </p>
        <p className="mt-2 text-sm text-slate-700">{forecastVerdict(project)}</p>
      </section>
      <section className="card p-5">
        <SectionHead title="Key metrics" />
        <dl className="text-sm space-y-2">
          <Row label="% done" value={`${Math.round(project.percent_done * 100)}%`} />
          <Row label="Days left" value={daysLeft(project)} />
          <Row label="Blocked" value={project.blocked_count} />
          <Row
            label="Active sprint"
            value={project.active_sprint?.title ?? project.active_sprint?.name ?? '—'}
          />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-slate-100 last:border-b-0 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 tabular-nums">{value}</dd>
    </div>
  );
}

function daysLeft(p: ProjectDetail): number | string {
  if (!p.end_date) return '—';
  const days = Math.ceil((new Date(p.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function forecastVerdict(p: ProjectDetail): string {
  const d = daysLeft(p);
  const days = typeof d === 'number' ? d : null;
  if (days === null) return 'No end date set.';
  if (p.percent_done >= 0.95) return 'On-track to finish.';
  if (days < 7 && p.percent_done < 0.7) return 'At risk — sprint behind plan.';
  return 'On-track.';
}
