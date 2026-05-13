import { api } from "../api/client";

export interface LoginBranding {
  headline: string;
  subtext: string;
}

export interface Session {
  user: string | null;
  csrf_token: string | null;
  roles?: string[];
  login_branding?: LoginBranding;
}

export async function probeSession(): Promise<Session> {
  const s = await api.get<Session>("/api/method/vernon_tasks.task.api.boot.boot");
  if (s.csrf_token) {
    (window as unknown as { csrf_token: string }).csrf_token = s.csrf_token;
  }
  return s;
}

export async function login(usr: string, pwd: string): Promise<Session> {
  await api.post("/api/method/login", { usr, pwd });
  return probeSession();
}

export async function logout(): Promise<void> {
  await api.post("/api/method/logout");
  (window as unknown as { csrf_token?: string }).csrf_token = undefined;
}
