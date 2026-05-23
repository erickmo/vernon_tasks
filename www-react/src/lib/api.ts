import axios, { AxiosError } from 'axios';
import { env } from './env';

export const api = axios.create({
  baseURL: env.API_BASE,
  withCredentials: true,
  headers: {
    'X-Frappe-CSRF-Token': 'fetch',
    Accept: 'application/json',
  },
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
