import axios, { AxiosError } from 'axios';
import { env } from './env';

export const api = axios.create({
  baseURL: env.API_BASE,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}
export function getCsrfToken(): string | null {
  return csrfToken;
}

api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (csrfToken && method !== 'get' && method !== 'head' && method !== 'options') {
    config.headers.set('X-Frappe-CSRF-Token', csrfToken);
  }
  return config;
});

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(err);
  },
);
