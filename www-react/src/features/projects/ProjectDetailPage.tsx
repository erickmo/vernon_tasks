import { useParams, Outlet, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DetailHeader } from './detail/DetailHeader';
import { TabsNav } from './detail/TabsNav';
import { KEY, getProjectDetail } from './projectsApi';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: id ? KEY.detail(id) : ['project', 'noop'],
    queryFn: () => getProjectDetail(id!),
    enabled: !!id,
  });
  if (!id) return <Navigate to="/portal/projects" replace />;
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Project not found.</p>;
  return (
    <div>
      <DetailHeader project={data} />
      <TabsNav />
      <Outlet context={data} />
    </div>
  );
}
