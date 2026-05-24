import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORTS_KEY, runReport } from './reportsApi';
import { ReportShell } from './ReportShell';
import { ProjectHealthHeatmap } from './slugs/ProjectHealthHeatmap';
import { OkrPacingChart } from './slugs/OkrPacingChart';
import { TeamThroughputChart } from './slugs/TeamThroughputChart';
import { MyPointsTimeline } from './slugs/MyPointsTimeline';
import { BurndownArchiveList } from './slugs/BurndownArchiveList';
import { RiskLogTable } from './slugs/RiskLogTable';
import { ScheduleModal } from './ScheduleModal';
import { TrendingUpIcon } from '@/components/icons';
import type { ReportFilters, ReportPayload } from './types';

const VIZ: Record<string, (p: ReportPayload) => JSX.Element> = {
  'project-health': (p) => <ProjectHealthHeatmap payload={p} />,
  'okr-pacing': (p) => <OkrPacingChart payload={p} />,
  'team-throughput': (p) => <TeamThroughputChart payload={p} />,
  'my-points': (p) => <MyPointsTimeline payload={p} />,
  'project-burndown-archive': (p) => <BurndownArchiveList payload={p} />,
  'risk-log': (p) => <RiskLogTable payload={p} />,
};

export function ReportDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: slug ? REPORTS_KEY.run(slug, filters) : ['report', 'noop'],
    queryFn: () => runReport(slug!, filters),
    enabled: !!slug,
  });

  if (!slug) {
    return <p className="text-sm text-rose-600">Missing report slug.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-slate-500">Running report…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-rose-600">Failed to run report.</p>;
  }

  const vizFactory =
    VIZ[slug] ??
    (() => (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <TrendingUpIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">
          No visualization for {slug}.
        </div>
      </div>
    ));

  return (
    <>
      <ReportShell
        payload={data}
        filters={filters}
        onFiltersChange={setFilters}
        onSchedule={() => setScheduleOpen(true)}
        onRefresh={() =>
          qc.invalidateQueries({ queryKey: REPORTS_KEY.run(slug, filters) })
        }
        vizSlot={vizFactory(data)}
      />
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        slug={slug}
        title={data.title}
        filters={filters}
      />
    </>
  );
}
