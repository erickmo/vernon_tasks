import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_KEY, fetchHome } from './dashboardApi';
import { useSession } from '@/features/auth/useSession';
import { AtRiskBanner } from './components/AtRiskBanner';
import { TodayCard } from './components/TodayCard';
import { MeCard } from './components/MeCard';
import { SprintsScroller } from './components/SprintsScroller';
import { ProjectsGrid } from './components/ProjectsGrid';
import { BrandHealthRollup } from './components/BrandHealthRollup';
import type { Role } from './types';

const STALE_TIME_MS = 60_000;

const ROLE_MAP: Array<[string, Role]> = [
  ['Vernon Exec', 'exec'],
  ['Vernon Leader', 'leader'],
  ['Vernon PM', 'pm'],
];

const ROLE_LABEL: Record<Role, string> = {
  exec: 'Eksekutif',
  leader: 'Leader',
  pm: 'Project Manager',
  ic: 'Individual Contributor',
};

function inferRole(roles: string[]): Role {
  for (const [needle, role] of ROLE_MAP) {
    if (roles.includes(needle)) return role;
  }
  return 'ic';
}

function PageHeader({ name, role }: { name?: string; role: Role }) {
  const first = name?.split(' ')[0] ?? 'kembali';
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="space-y-1.5">
        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{today}</div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-slate-900 leading-tight">
          Halo, {first}.
        </h1>
        <p className="text-[15px] text-slate-600">
          Ringkasan hari ini sebagai <span className="chip-brand">{ROLE_LABEL[role]}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-secondary btn-sm">Export</button>
        <button className="btn-primary btn-sm">+ New task</button>
      </div>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-9 w-72 bg-slate-200 rounded-xl" />
        <div className="h-4 w-56 bg-slate-200 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 card" />
        ))}
      </div>
      <div className="h-40 card" />
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
      <div className="card border-rose-100 bg-rose-50/60 px-5 py-4 text-sm text-rose-700">
        <span className="font-semibold">Failed to load dashboard.</span> {String(error)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <PageHeader name={session?.full_name} role={role} />
      <AtRiskBanner items={data.at_risk} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TodayCard data={data.today} />
        </div>
        <div>
          <MeCard data={data.me} />
        </div>
      </div>
      {(role === 'exec' || role === 'leader') && <BrandHealthRollup />}
      <SprintsScroller sprints={data.sprints} />
      <ProjectsGrid projects={data.projects} />
    </div>
  );
}
