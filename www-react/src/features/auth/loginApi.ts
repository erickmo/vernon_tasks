import { api } from '@/lib/api';
import type { FrappeUser } from '@/types/session';

export async function login(usr: string, pwd: string): Promise<void> {
  const body = new URLSearchParams({ usr, pwd }).toString();
  await api.post('/api/method/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

export async function logout(): Promise<void> {
  await api.post('/api/method/logout');
}

export async function fetchSession(): Promise<FrappeUser> {
  const who = await api.get<{ message: string }>('/api/method/frappe.auth.get_logged_user');
  const userId = who.data.message;
  const detail = await api.get<{ data: any }>(`/api/resource/User/${userId}`);
  const d = detail.data.data;
  return {
    name: d.name,
    full_name: d.full_name,
    user_image: d.user_image ?? null,
    language: d.language ?? 'en',
    roles: (d.roles ?? []).map((r: { role: string }) => r.role),
  };
}
