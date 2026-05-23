import { api } from '@/lib/api';
import type { DashboardPayload, Role } from './types';

export async function fetchHome(role: Role): Promise<DashboardPayload> {
  const res = await api.get<{ message: DashboardPayload }>(
    '/api/method/vernon_tasks.task.api.portal_dashboard.get_home',
    { params: { role } },
  );
  return res.data.message;
}

export const DASHBOARD_KEY = (role: Role) => ['dashboard', role] as const;
