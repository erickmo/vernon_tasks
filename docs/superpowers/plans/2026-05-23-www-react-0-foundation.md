# www-react Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold standalone Vite + React SPA at `apps/vernon_tasks/www-react/`, wire Frappe CORS + session-cookie auth, build the application shell (sidebar, topbar, command palette stub, theme), and ship a working `/login` → `/portal/dashboard` (placeholder) flow on its own domain via Caddy.

**Architecture:** Pure SPA (no SSR). React Router 7 data-router. TanStack Query 5 for server state. Zustand for UI state. Tailwind + shadcn/ui primitives. Frappe session cookie reused cross-domain (`SameSite=None; Secure`, `Access-Control-Allow-Credentials: true`).

**Tech Stack:** Vite 5, React 18, TypeScript 5 strict, React Router 7, TanStack Query 5, Tailwind 3, shadcn/ui, axios, Zustand, i18next, Sentry, Vitest + RTL, Playwright, MSW.

**Spec:** `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html` §1 (Architecture).

---

## File Structure (locked at this stage)

```
apps/vernon_tasks/www-react/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  index.html
  .gitignore
  .env.example
  README.md
  src/
    main.tsx                # entry, mounts router + providers
    app/
      router.tsx            # route definitions, auth guard
      providers.tsx         # QueryClient + Theme + Toaster + i18n
    layouts/
      PortalShell.tsx       # sidebar + topbar wrapper for /portal/*
      AuthLayout.tsx        # minimal wrapper for /login
    features/
      auth/
        LoginPage.tsx
        useSession.ts       # query: current user
        loginApi.ts         # POST /api/method/login
        logoutApi.ts
    components/
      Sidebar.tsx
      TopBar.tsx
      CommandPalette.tsx    # Cmd+K stub (open/close only this plan)
      ThemeToggle.tsx
      ProtectedRoute.tsx    # redirect to /login if not authed
    lib/
      api.ts                # axios instance + interceptors
      queryClient.ts
      session.ts            # session cookie helpers
      env.ts                # typed env access
    hooks/
      useShortcut.ts        # global keybind binder (Cmd+K)
      useTheme.ts
    types/
      session.ts            # FrappeUser type
    styles/
      globals.css           # tailwind base + tokens
    i18n/
      index.ts
      locales/
        en/common.json
        id/common.json
  tests/
    setup.ts
    unit/
      api.test.ts
      session.test.ts
      LoginPage.test.tsx
      ProtectedRoute.test.tsx
    e2e/
      login.spec.ts
  playwright.config.ts
  vitest.config.ts
caddy/
  dashboard.Caddyfile       # reverse-proxy config (snippet for ops)
```

Backend changes (Frappe site config — operator step, no code):
- `common_site_config.json`: `"allow_cors": "https://dashboard.vernon.local"` (replace with real host)
- `nginx`/`Caddy` returns `Access-Control-Allow-Credentials: true`, cookie set `SameSite=None; Secure`

---

### Task 1: Scaffold Vite project

**Files:**
- Create: `apps/vernon_tasks/www-react/package.json`
- Create: `apps/vernon_tasks/www-react/vite.config.ts`
- Create: `apps/vernon_tasks/www-react/tsconfig.json`
- Create: `apps/vernon_tasks/www-react/tsconfig.node.json`
- Create: `apps/vernon_tasks/www-react/index.html`
- Create: `apps/vernon_tasks/www-react/.gitignore`
- Create: `apps/vernon_tasks/www-react/.env.example`
- Create: `apps/vernon_tasks/www-react/src/main.tsx`
- Create: `apps/vernon_tasks/www-react/src/styles/globals.css`

- [ ] **Step 1: Initialise package.json**

```json
{
  "name": "vernon-www-react",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --max-warnings 0",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.7.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^4.5.0",
    "i18next": "^23.0.0",
    "react-i18next": "^14.0.0",
    "i18next-browser-languagedetector": "^7.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@tanstack/react-query-devtools": "^5.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^25.0.0",
    "msw": "^2.4.0",
    "@playwright/test": "^1.47.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0"
  }
}
```

- [ ] **Step 2: vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
```

- [ ] **Step 3: tsconfig.json (strict)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 5: index.html**

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <title>Vernon Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: .gitignore**

```
node_modules
dist
coverage
playwright-report
.env
.env.local
.DS_Store
```

- [ ] **Step 7: .env.example**

```
VITE_API_BASE=https://api.vernon.local
VITE_SENTRY_DSN=
VITE_APP_NAME=Vernon Dashboard
```

- [ ] **Step 8: src/main.tsx (placeholder, replaced in Task 4)**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <div>Vernon Dashboard — scaffolding</div>
  </StrictMode>,
);
```

- [ ] **Step 9: src/styles/globals.css (placeholder, replaced in Task 2)**

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

- [ ] **Step 10: Install + verify build**

Run: `cd apps/vernon_tasks/www-react && npm install && npm run build`
Expected: build succeeds, `dist/` produced, no TS errors.

- [ ] **Step 11: Commit**

```bash
cd apps/vernon_tasks
git add www-react/
git commit -m "feat(www-react): scaffold Vite + React 18 + TS strict project"
```

---

### Task 2: Wire Tailwind + tokens

**Files:**
- Create: `apps/vernon_tasks/www-react/tailwind.config.ts`
- Create: `apps/vernon_tasks/www-react/postcss.config.js`
- Modify: `apps/vernon_tasks/www-react/src/styles/globals.css`

- [ ] **Step 1: tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6836a0',
          hover:   '#7c4dab',
          subtle:  '#f3eeff',
        },
        risk: { red: '#ef4444', amber: '#f59e0b', green: '#10b981' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: globals.css with tailwind layers**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg: 255 255 255;
    --fg: 15 23 42;
    --muted: 100 116 139;
    --border: 226 232 240;
  }
  .dark {
    --bg: 15 23 42;
    --fg: 226 232 240;
    --muted: 148 163 184;
    --border: 51 65 85;
  }
  html, body, #root { height: 100%; }
  body {
    background: rgb(var(--bg));
    color: rgb(var(--fg));
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS, Tailwind classes purged into `dist/assets/*.css`.

- [ ] **Step 5: Commit**

```bash
git add www-react/tailwind.config.ts www-react/postcss.config.js www-react/src/styles/globals.css
git commit -m "feat(www-react): add Tailwind config with brand tokens + dark mode"
```

---

### Task 3: Typed env + axios client

**Files:**
- Create: `apps/vernon_tasks/www-react/src/lib/env.ts`
- Create: `apps/vernon_tasks/www-react/src/lib/api.ts`
- Create: `apps/vernon_tasks/www-react/tests/unit/api.test.ts`
- Create: `apps/vernon_tasks/www-react/vitest.config.ts`
- Create: `apps/vernon_tasks/www-react/tests/setup.ts`

- [ ] **Step 1: vitest config**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});
```

- [ ] **Step 2: tests/setup.ts**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
```

- [ ] **Step 3: src/lib/env.ts**

```ts
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
```

- [ ] **Step 4: Write failing test for api interceptor**

`tests/unit/api.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api, onUnauthorized } from '@/lib/api';

describe('api client', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  it('sends credentials with every request', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('calls onUnauthorized handler on 401', async () => {
    const spy = vi.fn();
    onUnauthorized(spy);
    mock.onGet('/api/method/ping').reply(401);
    await expect(api.get('/api/method/ping')).rejects.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Install axios-mock-adapter dev dep**

Run: `npm i -D axios-mock-adapter`

- [ ] **Step 6: Run test, expect FAIL**

Run: `npm test -- api.test`
Expected: FAIL — `api` not exported.

- [ ] **Step 7: Implement src/lib/api.ts**

```ts
import axios, { AxiosError } from 'axios';
import { env } from './env';

export const api = axios.create({
  baseURL: env.API_BASE,
  withCredentials: true,
  headers: {
    'X-Frappe-CSRF-Token': 'fetch', // Frappe accepts literal "fetch" then echoes real token on response
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
```

- [ ] **Step 8: Run test, expect PASS**

Run: `npm test -- api.test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add www-react/src/lib/env.ts www-react/src/lib/api.ts www-react/tests www-react/vitest.config.ts www-react/package.json www-react/package-lock.json
git commit -m "feat(www-react): typed env + axios client with 401 interceptor"
```

---

### Task 4: Session query + login API

**Files:**
- Create: `apps/vernon_tasks/www-react/src/types/session.ts`
- Create: `apps/vernon_tasks/www-react/src/features/auth/loginApi.ts`
- Create: `apps/vernon_tasks/www-react/src/features/auth/logoutApi.ts`
- Create: `apps/vernon_tasks/www-react/src/features/auth/useSession.ts`
- Create: `apps/vernon_tasks/www-react/tests/unit/session.test.ts`

- [ ] **Step 1: types/session.ts**

```ts
export type FrappeUser = {
  name: string;            // email / username
  full_name: string;
  user_image: string | null;
  roles: string[];
  language: string;
};
```

- [ ] **Step 2: Write failing test**

`tests/unit/session.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { fetchSession, login, logout } from '@/features/auth/loginApi';

describe('session api', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('login POSTs usr+pwd to /api/method/login', async () => {
    mock.onPost('/api/method/login').reply(200, { message: 'Logged In' });
    await login('mo@vernon.id', 'secret');
    expect(mock.history.post[0].data).toBe('usr=mo%40vernon.id&pwd=secret');
  });

  it('fetchSession returns FrappeUser from get_logged_user + user detail', async () => {
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(200, { message: 'mo@vernon.id' });
    mock.onGet('/api/resource/User/mo@vernon.id').reply(200, {
      data: { name: 'mo@vernon.id', full_name: 'Mo', user_image: null, language: 'id', roles: [{ role: 'System Manager' }] },
    });
    const user = await fetchSession();
    expect(user.full_name).toBe('Mo');
    expect(user.roles).toContain('System Manager');
  });

  it('logout POSTs to /api/method/logout', async () => {
    mock.onPost('/api/method/logout').reply(200);
    await logout();
    expect(mock.history.post.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `npm test -- session.test`
Expected: FAIL.

- [ ] **Step 4: Implement loginApi.ts**

```ts
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
  const detail = await api.get<{ data: any }>(`/api/resource/User/${encodeURIComponent(userId)}`);
  const d = detail.data.data;
  return {
    name: d.name,
    full_name: d.full_name,
    user_image: d.user_image ?? null,
    language: d.language ?? 'en',
    roles: (d.roles ?? []).map((r: { role: string }) => r.role),
  };
}
```

- [ ] **Step 5: logoutApi.ts (re-export for clarity)**

```ts
export { logout } from './loginApi';
```

- [ ] **Step 6: useSession.ts**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSession } from './loginApi';

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useInvalidateSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SESSION_KEY });
}
```

- [ ] **Step 7: Run test, expect PASS**

Run: `npm test -- session.test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add www-react/src/types www-react/src/features/auth www-react/tests/unit/session.test.ts
git commit -m "feat(www-react): session query + login/logout API"
```

---

### Task 5: QueryClient + Providers + main entry

**Files:**
- Create: `apps/vernon_tasks/www-react/src/lib/queryClient.ts`
- Create: `apps/vernon_tasks/www-react/src/app/providers.tsx`
- Modify: `apps/vernon_tasks/www-react/src/main.tsx`

- [ ] **Step 1: queryClient.ts**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: { retry: 0 },
  },
});
```

- [ ] **Step 2: providers.tsx**

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ReactNode, useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';
import { onUnauthorized } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <UnauthorizedRedirect />
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

function UnauthorizedRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    onUnauthorized(() => {
      queryClient.clear();
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    });
  }, [navigate]);
  return null;
}
```

- [ ] **Step 3: Replace main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 4: Commit (will fail build until Task 6 router exists — chained commit OK after Task 6)**

Hold commit; proceed to Task 6.

---

### Task 6: Router + ProtectedRoute + placeholder pages

**Files:**
- Create: `apps/vernon_tasks/www-react/src/app/router.tsx`
- Create: `apps/vernon_tasks/www-react/src/components/ProtectedRoute.tsx`
- Create: `apps/vernon_tasks/www-react/src/layouts/AuthLayout.tsx`
- Create: `apps/vernon_tasks/www-react/src/layouts/PortalShell.tsx` (stub — full version Task 8)
- Create: `apps/vernon_tasks/www-react/tests/unit/ProtectedRoute.test.tsx`

- [ ] **Step 1: ProtectedRoute test (failing)**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ProtectedRoute } from '@/components/ProtectedRoute';

function wrap(ui: React.ReactNode, route = '/portal/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/portal/*" element={<ProtectedRoute>{ui}</ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  it('renders children when session resolves', async () => {
    const mock = new MockAdapter(api);
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(200, { message: 'u' });
    mock.onGet(/\/api\/resource\/User\//).reply(200, { data: { name: 'u', full_name: 'U', roles: [] } });
    wrap(<div>SECRET</div>);
    expect(await screen.findByText('SECRET')).toBeInTheDocument();
  });

  it('redirects to /login on 401', async () => {
    const mock = new MockAdapter(api);
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(401);
    wrap(<div>SECRET</div>);
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- ProtectedRoute`
Expected: FAIL.

- [ ] **Step 3: Implement ProtectedRoute.tsx**

```tsx
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/features/auth/useSession';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useSession();
  const loc = useLocation();
  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (isError || !data) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: AuthLayout.tsx**

```tsx
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 5: PortalShell.tsx (stub — full UI in Task 8)**

```tsx
import { Outlet } from 'react-router-dom';

export function PortalShell() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
        <div className="font-semibold">Vernon</div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: router.tsx**

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Providers } from './providers';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalShell } from '@/layouts/PortalShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';

function PlaceholderPage({ title }: { title: string }) {
  return <h1 className="text-xl font-semibold">{title}</h1>;
}

export const router = createBrowserRouter([
  {
    element: <Providers><RouterOutlet /></Providers>,
    children: [
      { path: '/', element: <Navigate to="/portal/dashboard" replace /> },
      {
        path: '/login',
        element: <AuthLayout />,
        children: [{ index: true, element: <LoginPage /> }],
      },
      {
        path: '/portal',
        element: (
          <ProtectedRoute>
            <PortalShell />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', element: <PlaceholderPage title="Dashboard" /> },
          { path: 'projects', element: <PlaceholderPage title="Projects" /> },
          { path: 'projects/:id', element: <PlaceholderPage title="Project Detail" /> },
          { path: 'worksheet', element: <PlaceholderPage title="Worksheet" /> },
          { path: 'reports', element: <PlaceholderPage title="Reports" /> },
          { path: 'reports/:slug', element: <PlaceholderPage title="Report Detail" /> },
        ],
      },
      { path: '*', element: <div className="p-8">404</div> },
    ],
  },
]);

import { Outlet } from 'react-router-dom';
function RouterOutlet() { return <Outlet />; }
```

- [ ] **Step 7: Run all tests + build**

Run: `npm test && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add www-react/src/lib/queryClient.ts www-react/src/app www-react/src/components/ProtectedRoute.tsx www-react/src/layouts www-react/src/main.tsx www-react/tests/unit/ProtectedRoute.test.tsx
git commit -m "feat(www-react): router + providers + ProtectedRoute"
```

---

### Task 7: LoginPage

**Files:**
- Create: `apps/vernon_tasks/www-react/src/features/auth/LoginPage.tsx`
- Create: `apps/vernon_tasks/www-react/tests/unit/LoginPage.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { LoginPage } from '@/features/auth/LoginPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login?next=/portal/projects']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal/projects" element={<div>PROJECTS</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('submits credentials and navigates to next param', async () => {
    mock.onPost('/api/method/login').reply(200, { message: 'Logged In' });
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(200, { message: 'mo' });
    mock.onGet(/\/api\/resource\/User\//).reply(200, { data: { name: 'mo', full_name: 'Mo', roles: [] } });

    setup();
    await userEvent.type(screen.getByLabelText(/email/i), 'mo@vernon.id');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('PROJECTS')).toBeInTheDocument();
  });

  it('shows error on invalid creds', async () => {
    mock.onPost('/api/method/login').reply(401, { message: 'Invalid' });
    setup();
    await userEvent.type(screen.getByLabelText(/email/i), 'x@y.z');
    await userEvent.type(screen.getByLabelText(/password/i), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- LoginPage`
Expected: FAIL.

- [ ] **Step 3: Implement LoginPage.tsx**

```tsx
import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from './loginApi';
import { useInvalidateSession } from './useSession';
import { env } from '@/lib/env';

export function LoginPage() {
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const invalidate = useInvalidateSession();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(usr, pwd);
      await invalidate();
      const next = params.get('next') || '/portal/dashboard';
      nav(next, { replace: true });
    } catch {
      setErr('Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 rounded-lg shadow border border-slate-200 dark:border-slate-800 space-y-4"
    >
      <h1 className="text-lg font-semibold">{env.APP_NAME}</h1>
      <div>
        <label htmlFor="usr" className="block text-sm font-medium">Email</label>
        <input
          id="usr"
          type="email"
          required
          value={usr}
          onChange={(e) => setUsr(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="pwd" className="block text-sm font-medium">Password</label>
        <input
          id="pwd"
          type="password"
          required
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {err && <div role="alert" className="text-sm text-risk-red">{err}</div>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-brand text-white px-4 py-2 text-sm font-medium hover:bg-brand-hover disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- LoginPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www-react/src/features/auth/LoginPage.tsx www-react/tests/unit/LoginPage.test.tsx
git commit -m "feat(www-react): login page with next-param redirect"
```

---

### Task 8: Full PortalShell — Sidebar + TopBar + ThemeToggle

**Files:**
- Modify: `apps/vernon_tasks/www-react/src/layouts/PortalShell.tsx`
- Create: `apps/vernon_tasks/www-react/src/components/Sidebar.tsx`
- Create: `apps/vernon_tasks/www-react/src/components/TopBar.tsx`
- Create: `apps/vernon_tasks/www-react/src/components/ThemeToggle.tsx`
- Create: `apps/vernon_tasks/www-react/src/hooks/useTheme.ts`

- [ ] **Step 1: useTheme.ts**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeState = {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: ThemeState['theme']) => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'vernon-theme' },
  ),
);

export function applyTheme(theme: ThemeState['theme']) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}
```

- [ ] **Step 2: ThemeToggle.tsx**

```tsx
import { useEffect } from 'react';
import { applyTheme, useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
      className="text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
```

- [ ] **Step 3: Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import clsx from 'clsx';

type SidebarState = { collapsed: boolean; toggle: () => void };
export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({ collapsed: false, toggle: () => set((s) => ({ collapsed: !s.collapsed })) }),
    { name: 'vernon-sidebar' },
  ),
);

const groups = [
  {
    label: 'WORK',
    items: [
      { to: '/portal/dashboard', label: 'Dashboard', icon: '◎' },
      { to: '/portal/worksheet', label: 'Worksheet', icon: '☷' },
      { to: '/portal/projects',  label: 'Projects',  icon: '▦' },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [{ to: '/portal/reports', label: 'Reports', icon: '∿' }],
  },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  return (
    <aside
      className={clsx(
        'bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className="flex items-center justify-between p-3">
        {!collapsed && <span className="font-semibold text-brand">Vernon</span>}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-xs px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="mt-2">
          {!collapsed && (
            <div className="px-3 text-[10px] font-bold tracking-wider text-slate-500">
              {g.label}
            </div>
          )}
          <ul>
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 text-sm',
                      isActive
                        ? 'bg-brand-subtle text-brand border-l-2 border-brand'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800',
                    )
                  }
                >
                  <span className="w-4 text-center">{it.icon}</span>
                  {!collapsed && <span>{it.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: TopBar.tsx**

```tsx
import { useSession } from '@/features/auth/useSession';
import { logout } from '@/features/auth/loginApi';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { data: user } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();

  async function onLogout() {
    await logout();
    qc.clear();
    nav('/login', { replace: true });
  }

  return (
    <header className="h-12 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-800">
      <button
        onClick={onOpenPalette}
        className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        {user && (
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {user.full_name}
          </span>
        )}
        <button onClick={onLogout} className="text-xs underline">Sign out</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Replace PortalShell.tsx**

```tsx
import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { CommandPalette } from '@/components/CommandPalette';
import { useShortcut } from '@/hooks/useShortcut';

export function PortalShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useShortcut(['mod+k'], () => setPaletteOpen((o) => !o));

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 6: Build to verify**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add www-react/src/components/Sidebar.tsx www-react/src/components/TopBar.tsx www-react/src/components/ThemeToggle.tsx www-react/src/hooks/useTheme.ts www-react/src/layouts/PortalShell.tsx
git commit -m "feat(www-react): portal shell with sidebar + topbar + theme toggle"
```

---

### Task 9: Command palette stub + keyboard shortcut hook

**Files:**
- Create: `apps/vernon_tasks/www-react/src/hooks/useShortcut.ts`
- Create: `apps/vernon_tasks/www-react/src/components/CommandPalette.tsx`

- [ ] **Step 1: useShortcut.ts**

```ts
import { useEffect } from 'react';

type Combo = string; // e.g. "mod+k", "j", "/"
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

function matches(e: KeyboardEvent, combo: Combo): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop()!;
  const needMod = parts.includes('mod');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const modOk = needMod ? (isMac ? e.metaKey : e.ctrlKey) : true;
  return (
    e.key.toLowerCase() === key &&
    modOk &&
    e.shiftKey === needShift &&
    e.altKey === needAlt
  );
}

export function useShortcut(combos: Combo[], handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (combos.some((c) => matches(e, c))) {
        e.preventDefault();
        handler(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combos, handler]);
}
```

- [ ] **Step 2: CommandPalette.tsx (minimal: nav to pages by name)**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const commands = [
  { id: 'go-dashboard', label: 'Go to Dashboard', to: '/portal/dashboard' },
  { id: 'go-worksheet', label: 'Go to Worksheet', to: '/portal/worksheet' },
  { id: 'go-projects',  label: 'Go to Projects',  to: '/portal/projects' },
  { id: 'go-reports',   label: 'Go to Reports',   to: '/portal/reports' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  useEffect(() => { if (!open) setQ(''); }, [open]);
  if (!open) return null;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-32 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a command…"
          className="w-full px-4 py-3 bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none"
        />
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { nav(c.to); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                {c.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">No commands</li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + manual smoke test**

Run: `npm run dev` and visit `http://localhost:5174/login` (auth will redirect — manual test deferred to e2e in Task 11).

- [ ] **Step 4: Commit**

```bash
git add www-react/src/hooks/useShortcut.ts www-react/src/components/CommandPalette.tsx
git commit -m "feat(www-react): command palette stub + useShortcut hook"
```

---

### Task 10: i18n boot

**Files:**
- Create: `apps/vernon_tasks/www-react/src/i18n/index.ts`
- Create: `apps/vernon_tasks/www-react/src/i18n/locales/en/common.json`
- Create: `apps/vernon_tasks/www-react/src/i18n/locales/id/common.json`
- Modify: `apps/vernon_tasks/www-react/src/main.tsx`

- [ ] **Step 1: en/common.json**

```json
{
  "appName": "Vernon Dashboard",
  "auth": { "signIn": "Sign in", "signOut": "Sign out", "email": "Email", "password": "Password", "invalid": "Invalid email or password" },
  "nav": { "dashboard": "Dashboard", "worksheet": "Worksheet", "projects": "Projects", "reports": "Reports" }
}
```

- [ ] **Step 2: id/common.json**

```json
{
  "appName": "Vernon Dashboard",
  "auth": { "signIn": "Masuk", "signOut": "Keluar", "email": "Email", "password": "Kata sandi", "invalid": "Email atau kata sandi salah" },
  "nav": { "dashboard": "Dasbor", "worksheet": "Lembar Kerja", "projects": "Proyek", "reports": "Laporan" }
}
```

- [ ] **Step 3: i18n/index.ts**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/common.json';
import id from './locales/id/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      id: { common: id },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 4: Import in main.tsx**

Add at top of `src/main.tsx`:
```ts
import './i18n';
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add www-react/src/i18n www-react/src/main.tsx
git commit -m "feat(www-react): i18n boot with id + en bundles"
```

---

### Task 11: Playwright e2e — login → dashboard

**Files:**
- Create: `apps/vernon_tasks/www-react/playwright.config.ts`
- Create: `apps/vernon_tasks/www-react/tests/e2e/login.spec.ts`

- [ ] **Step 1: playwright.config.ts**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    port: 5174,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: login.spec.ts**

```ts
import { test, expect } from '@playwright/test';

test('login redirects to dashboard placeholder', async ({ page, context }) => {
  // Mock Frappe endpoints
  await context.route('**/api/method/login', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ message: 'Logged In' }) }),
  );
  await context.route('**/api/method/frappe.auth.get_logged_user', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ message: 'mo@vernon.id' }) }),
  );
  await context.route('**/api/resource/User/**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        data: { name: 'mo@vernon.id', full_name: 'Mo', user_image: null, language: 'id', roles: [] },
      }),
    }),
  );

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('mo@vernon.id');
  await page.getByLabel(/password/i).fill('secret');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

- [ ] **Step 3: Install playwright browsers**

Run: `npx playwright install chromium`

- [ ] **Step 4: Run e2e**

Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www-react/playwright.config.ts www-react/tests/e2e/login.spec.ts
git commit -m "test(www-react): e2e login → dashboard placeholder"
```

---

### Task 12: Caddy snippet + ops notes

**Files:**
- Create: `caddy/dashboard.Caddyfile`
- Create: `apps/vernon_tasks/www-react/README.md`

- [ ] **Step 1: caddy/dashboard.Caddyfile**

```caddy
# Vernon Dashboard (www-react) reverse proxy
# Drop this file into /etc/caddy/conf.d/ (or import into main Caddyfile)
# Requires real TLS cert (cookies need Secure).

dashboard.vernon.local {
    tls /etc/caddy/certs/vernon.crt /etc/caddy/certs/vernon.key

    # SPA: serve built static assets, fall back to index.html for client routes
    handle /assets/* {
        root * /var/www/vernon-dashboard
        file_server
        header Cache-Control "public, max-age=31536000, immutable"
    }
    handle / {
        root * /var/www/vernon-dashboard
        try_files {path} /index.html
        file_server
    }

    # Proxy Frappe API
    @api path /api/* /assets/frappe/* /private/files/*
    handle @api {
        reverse_proxy https://erp.vernon.local {
            header_up Host {http.reverse_proxy.upstream.hostport}
            header_up X-Forwarded-Proto https
        }
    }

    # Cross-origin cookies require SameSite=None; Secure
    header {
        Access-Control-Allow-Origin "https://dashboard.vernon.local"
        Access-Control-Allow-Credentials "true"
        Access-Control-Allow-Headers "Content-Type, X-Frappe-CSRF-Token"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    }

    @options method OPTIONS
    handle @options {
        respond 204
    }
}
```

- [ ] **Step 2: README.md**

```markdown
# Vernon www-react

Standalone Vite + React 18 SPA for the Vernon Tasks desktop dashboard.

## Dev

    npm install
    cp .env.example .env  # set VITE_API_BASE to your Frappe origin
    npm run dev           # http://localhost:5174

## Test

    npm test               # vitest unit + integration
    npm run e2e            # playwright (auto-starts dev server)
    npm run typecheck

## Build

    npm run build          # output to dist/

## Deploy

1. Build → upload `dist/` to `/var/www/vernon-dashboard` on the gateway host.
2. Apply `caddy/dashboard.Caddyfile` and reload Caddy.
3. Frappe site config (`common_site_config.json`) must include:

       "allow_cors": "https://dashboard.vernon.local"

4. Verify cross-origin cookie: `curl -i https://dashboard.vernon.local/api/method/login -d 'usr=...&pwd=...'`
   Response must include `Set-Cookie: sid=...; Secure; SameSite=None`.

## Spec / Plans

- Spec: `../docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html`
- Plans: `../docs/superpowers/plans/2026-05-23-www-react-*.md`
```

- [ ] **Step 3: Commit**

```bash
git add caddy/dashboard.Caddyfile apps/vernon_tasks/www-react/README.md
git commit -m "ops(www-react): Caddy reverse-proxy snippet + README"
```

---

## Definition of Done — Foundation

- `npm install && npm run build` succeeds with zero warnings
- `npm test` green (≥6 unit/integration tests)
- `npm run e2e` green (login flow mocked)
- `npm run typecheck` clean
- Login → `/portal/dashboard` placeholder renders behind ProtectedRoute
- Sidebar collapses, theme switches, Cmd+K opens palette, logout returns to `/login`
- Caddy snippet committed for ops
