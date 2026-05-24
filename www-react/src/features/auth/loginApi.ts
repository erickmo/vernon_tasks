import { api, setCsrfToken } from '@/lib/api';
import type { FrappeUser } from '@/types/session';

type BootResponse = {
  user: string | null;
  csrf_token: string | null;
  roles: string[];
};

async function boot(): Promise<BootResponse> {
  const res = await api.get<BootResponse>('/api/method/vernon_tasks.task.api.boot.boot');
  const data = (res.data as unknown as { message?: BootResponse }).message ?? res.data;
  setCsrfToken(data.csrf_token);
  return data;
}

export async function login(usr: string, pwd: string): Promise<void> {
  const body = new URLSearchParams({ usr, pwd }).toString();
  await api.post('/api/method/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  await boot();
}

export async function logout(): Promise<void> {
  await api.post('/api/method/logout');
  setCsrfToken(null);
}

export async function fetchSession(): Promise<FrappeUser> {
  const b = await boot();
  if (!b.user) throw new Error('not_authenticated');
  const detail = await api.get<{ data: any }>(`/api/resource/User/${b.user}`);
  const d = detail.data.data;
  return {
    name: d.name,
    full_name: d.full_name,
    user_image: d.user_image ?? null,
    language: d.language ?? 'en',
    roles: b.roles?.length ? b.roles : (d.roles ?? []).map((r: { role: string }) => r.role),
  };
}
