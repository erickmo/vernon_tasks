type Env = {
  API_BASE: string;
  SENTRY_DSN: string;
  APP_NAME: string;
};

function read(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

export const env: Env = {
  API_BASE: read('VITE_API_BASE'),
  SENTRY_DSN: read('VITE_SENTRY_DSN'),
  APP_NAME: read('VITE_APP_NAME', 'Vernon Dashboard'),
};

if (!env.API_BASE) {
  throw new Error('VITE_API_BASE is required');
}
