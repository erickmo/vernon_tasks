import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_KEY, fetchHome } from './dashboardApi';
import { useSession } from '@/features/auth/useSession';
import { AtRiskBanner } from './components/AtRiskBanner';
import { TodayCard } from './components/TodayCard';
import { MeCard } from './components/MeCard';
import { SprintsScroller } from './components/SprintsScroller';
import { ProjectsGrid } from './components/ProjectsGrid';
import type { Role } from './types';

const STALE_TIME_MS = 60_000;

const ROLE_MAP: Array<[string, Role]> = [
  ['Vernon Exec', 'exec'],
  ['Vernon Leader', 'leader'],
  ['Vernon PM', 'pm'],
];

function inferRole(roles: string[]): Role {
  for (const [needle, role] of ROLE_MAP) {
    if (roles.includes(needle)) return role;
  }
  return 'ic';
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
        ))}
      </div>
      <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded" />
    </div>
  );
}

export function DashboardPage() {
  const { data: session } = useSession();
  const role: Role = session ? inferRole(session.roles) : 'ic';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: DASHBOARD_KEY(role),
    queryFn: () => fetchHome(role),
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <SkeletonDashboard />;
  if (isError) {
    return (
      <p className="text-sm text-risk-red">Failed to load dashboard: {String(error)}</p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <AtRiskBanner items={data.at_risk} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TodayCard data={data.today} />
        </div>
        <div>
          <MeCard data={data.me} />
        </div>
      </div>
      <SprintsScroller sprints={data.sprints} />
      <ProjectsGrid projects={data.projects} />
    </div>
  );
}
