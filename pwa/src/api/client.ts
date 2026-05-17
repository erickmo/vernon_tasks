type AuthChallenge = () => Promise<boolean>;

let authHandler: AuthChallenge | null = null;
export function onAuthChallenge(handler: AuthChallenge) {
  authHandler = handler;
}

function getCsrf(): string | undefined {
  return (window as unknown as { csrf_token?: string }).csrf_token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "fetch" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const csrf = getCsrf();
  if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;

  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) {
    if (retry && authHandler) {
      const ok = await authHandler();
      if (ok) return request<T>(method, url, body, false);
    }
    throw new ApiError(res.status, "Unauthorized");
  }

  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text);
  return (json && "message" in json ? json.message : json) as T;
}

function withQuery(url: string, params?: Record<string, string | undefined>): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.append(k, v);
  }
  const s = qs.toString();
  if (!s) return url;
  return url.includes("?") ? `${url}&${s}` : `${url}?${s}`;
}

export const api = {
  get: <T>(url: string, params?: Record<string, string | undefined>) =>
    request<T>("GET", withQuery(url, params)),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  delete: <T>(url: string) => request<T>("DELETE", url),
};
