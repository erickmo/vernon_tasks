# Desktop Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the umbrella desktop portal foundation at `/portal/*` inside the existing `pwa/` codebase — shell, topbar nav, auth/permission, error boundaries, telemetry, and domain stubs — behind the `portal_enabled` feature flag.

**Architecture:** Approach A — single Vite SPA, multi-shell routing. `pwa/src/router.tsx` branches `/m/*` to the existing `<MobileShell>` and `/portal/*` to a lazy-loaded `<PortalShell>`. Shared primitives (auth, api, cache, theme, i18n, telemetry, atoms) live at `pwa/src/`; portal-specific layout and pages live under `pwa/src/portal/`.

**Tech Stack:** Frappe Framework (Python), React + Vite (`pwa/`), TypeScript, react-query, react-router, vitest + MSW, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-17-desktop-portal-foundation-design.md`

---

## Task 1: Add `portal_enabled` flag to VT Settings

**Files:**
- Modify: `vernon_tasks/vt_settings/vt_settings/vt_settings.json` (DocType definition — locate first)
- Test: `vernon_tasks/vt_settings/test_vt_settings.py` (extend if exists, else create)

- [ ] **Step 1: Locate VT Settings DocType definition**

Run: `find vernon_tasks/vt_settings -name "*.json" -type f`
Expected: lists JSON DocType file(s). Identify the file with `"doctype": "DocType"` and `"name": "VT Settings"`.

- [ ] **Step 2: Add `portal_enabled` Check field to VT Settings**

Insert into the `fields` array of the VT Settings DocType JSON (next to other feature toggles):

```json
{
  "fieldname": "portal_enabled",
  "label": "Enable Desktop Portal (/portal)",
  "fieldtype": "Check",
  "default": "0",
  "description": "When enabled, /portal/* serves the desktop portal. When disabled, requests to /portal/* redirect to /m/."
}
```

- [ ] **Step 3: Apply schema change**

Run: `bench --site <site> migrate`
Expected: migration applies, no error.

- [ ] **Step 4: Verify field via Frappe console**

Run:
```bash
bench --site <site> console <<'EOF'
import frappe
print(frappe.db.get_single_value('VT Settings', 'portal_enabled'))
EOF
```
Expected: prints `0` (default).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/vt_settings/
git commit -m "feat(vt-settings): add portal_enabled flag"
```

---

## Task 2: Backend `get_user_permissions` API

**Files:**
- Modify: `vernon_tasks/api/auth.py` (extend; create if missing)
- Test: `vernon_tasks/api/test_auth.py`

- [ ] **Step 1: Write failing test**

Create `vernon_tasks/api/test_auth.py`:

```python
import frappe
import unittest
from vernon_tasks.api.auth import get_user_permissions

PORTAL_PERM_KEYS = {
    "okr.read", "okr.write",
    "project.read", "project.write",
    "workforce.read",
    "report.read",
}

class TestGetUserPermissions(unittest.TestCase):
    def setUp(self):
        self.user_email = "portal_test_user@example.com"
        if not frappe.db.exists("User", self.user_email):
            user = frappe.get_doc({
                "doctype": "User",
                "email": self.user_email,
                "first_name": "Portal",
                "send_welcome_email": 0,
            }).insert(ignore_permissions=True)
        frappe.set_user(self.user_email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_returns_permissions_and_roles_keys(self):
        result = get_user_permissions()
        self.assertIn("permissions", result)
        self.assertIn("roles", result)
        self.assertIsInstance(result["permissions"], list)
        self.assertIsInstance(result["roles"], list)

    def test_permissions_subset_of_known_keys(self):
        result = get_user_permissions()
        self.assertTrue(set(result["permissions"]).issubset(PORTAL_PERM_KEYS))

    def test_manager_role_gets_read_permissions(self):
        frappe.set_user("Administrator")
        user = frappe.get_doc("User", self.user_email)
        if "Projects Manager" not in [r.role for r in user.roles]:
            user.append("roles", {"role": "Projects Manager"})
            user.save(ignore_permissions=True)
        frappe.set_user(self.user_email)
        result = get_user_permissions()
        self.assertIn("project.read", result["permissions"])
```

- [ ] **Step 2: Run test (expect fail — function missing)**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.api.test_auth`
Expected: ImportError or AttributeError on `get_user_permissions`.

- [ ] **Step 3: Implement endpoint**

Create or extend `vernon_tasks/api/auth.py`:

```python
import frappe

ROLE_TO_PERMISSIONS = {
    "System Manager":   ["okr.read", "okr.write", "project.read", "project.write", "workforce.read", "report.read"],
    "Projects Manager": ["okr.read", "project.read", "project.write", "workforce.read", "report.read"],
    "HR Manager":       ["workforce.read", "report.read"],
    "Employee":         [],
}

@frappe.whitelist()
def get_user_permissions():
    user = frappe.session.user
    if user == "Guest":
        return {"permissions": [], "roles": []}
    roles = frappe.get_roles(user)
    perms = set()
    for role in roles:
        perms.update(ROLE_TO_PERMISSIONS.get(role, []))
    return {"permissions": sorted(perms), "roles": roles}
```

- [ ] **Step 4: Re-run test (expect pass)**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.api.test_auth`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/auth.py vernon_tasks/api/test_auth.py
git commit -m "feat(api): get_user_permissions returns role-derived permission keys"
```

---

## Task 3: Frappe routing for `/portal/*`

**Files:**
- Create: `vernon_tasks/www/portal.py (sibling of www/m.py)`
- Create: `vernon_tasks/www/portal.py`
- Create: `vernon_tasks/www/portal.html`
- Modify: `vernon_tasks/hooks.py` (extend `website_route_rules`)

- [ ] **Step 1: Inspect existing `/m/` page for parity**

Run: `cat vernon_tasks/www/m/m.py vernon_tasks/www/m/m.html`
Expected: tiny Python + HTML that serves the PWA index. Mirror its shape.

- [ ] **Step 2: Create portal www module**

Create `vernon_tasks/www/portal.py (sibling of www/m.py)` (empty file).

Create `vernon_tasks/www/portal.py`:

```python
import frappe

no_cache = 1

def get_context(context):
    portal_enabled = frappe.db.get_single_value("VT Settings", "portal_enabled")
    if not portal_enabled:
        frappe.local.flags.redirect_location = "/m/"
        raise frappe.Redirect
    context.no_cache = 1
    return context
```

Create `vernon_tasks/www/portal.html` (mirror `m.html` — load the PWA bundle):

```html
{% extends "templates/web.html" %}
{% block page_content %}
<div id="root"></div>
<script type="module" src="/assets/vernon_tasks/pwa/index.js"></script>
{% endblock %}
```

(If `m.html` uses a different asset path/include pattern, copy that pattern exactly — same script tag, same root div id used by `pwa/index.html`.)

- [ ] **Step 3: Wire route rule**

In `vernon_tasks/hooks.py`, find existing `website_route_rules` (added for `/m/*`). Add:

```python
website_route_rules += [
    {"from_route": "/portal/<path:portal_path>", "to_route": "portal"},
    {"from_route": "/portal",                 "to_route": "portal"},
]
```

(If `website_route_rules` is not yet a list in scope, declare/extend it consistently with how `/m/*` was registered.)

- [ ] **Step 4: Enable the flag and smoke-test**

Run:
```bash
bench --site <site> set-config -p portal_enabled 1 --as-dict   # if config-style; else use console:
bench --site <site> console <<'EOF'
import frappe
frappe.db.set_single_value("VT Settings", "portal_enabled", 1)
frappe.db.commit()
EOF
bench --site <site> clear-cache
curl -sI http://<site>/portal | head -1
```
Expected: `HTTP/1.1 200 OK`. With `portal_enabled=0`, expect `302` to `/m/`.

- [ ] **Step 5: Document Nginx asset symlink in repo**

Append to `docs/prd/ops.html` (or create `docs/rollout/portal-asset-symlink.html`) a one-liner deployment note:

> `sites/<site>/public/portal` → symlink to `pwa/dist/` (mirror of `/m/` per memory `project_frappe_pwa_nginx`).

(Plain HTML snippet, consistent with existing docs hub HTML format.)

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/www/portal/ vernon_tasks/hooks.py docs/
git commit -m "feat(routing): mount /portal/* for desktop portal with portal_enabled gate"
```

---

## Task 4: PWA folder restructure — move mobile pages

**Files:**
- Move: `pwa/src/pages/**` → `pwa/src/mobile/pages/**`
- Modify: every import referencing `pwa/src/pages/...` (router, AppShell, tests)

- [ ] **Step 1: List affected files**

Run:
```bash
ls pwa/src/pages/
grep -rln "from .*pages/" pwa/src pwa/e2e
```
Expected: enumerate files needing import path updates.

- [ ] **Step 2: Move with git mv**

Run:
```bash
mkdir -p pwa/src/mobile
git mv pwa/src/pages pwa/src/mobile/pages
```

- [ ] **Step 3: Update all imports**

For each file from Step 1, replace `from '../pages/...'`, `from './pages/...'`, `from '@/pages/...'` etc., with the equivalent `mobile/pages/...` path. Adjust depth (`../mobile/pages` vs `../../mobile/pages`) per file location.

- [ ] **Step 4: Typecheck + tests**

Run:
```bash
cd pwa && npm run typecheck && npm test -- --run
```
Expected: 0 type errors, all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src pwa/e2e
git commit -m "refactor(pwa): move pages/ under mobile/pages/ to make room for portal/"
```

---

## Task 5: Shared `EmptyState` + `PageSkeleton` components

**Files:**
- Create: `pwa/src/components/EmptyState.tsx`
- Create: `pwa/src/components/EmptyState.test.tsx`
- Create: `pwa/src/components/PageSkeleton.tsx`
- Create: `pwa/src/components/PageSkeleton.test.tsx`

- [ ] **Step 1: Write `EmptyState` failing test**

Create `pwa/src/components/EmptyState.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No data" description="Nothing yet" />);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(<EmptyState title="t" action={<button>Create</button>} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- EmptyState`
Expected: module not found.

- [ ] **Step 3: Implement `EmptyState`**

Create `pwa/src/components/EmptyState.tsx`:

```tsx
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- EmptyState`
Expected: 2 passed.

- [ ] **Step 5: Write `PageSkeleton` failing test**

Create `pwa/src/components/PageSkeleton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageSkeleton } from "./PageSkeleton";

describe("PageSkeleton", () => {
  it("renders aria-busy region", () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Implement `PageSkeleton`**

Create `pwa/src/components/PageSkeleton.tsx`:

```tsx
export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-live="polite">
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__bar page-skeleton__bar--short" />
    </div>
  );
}
```

- [ ] **Step 7: Run both tests (expect pass)**

Run: `cd pwa && npm test -- EmptyState PageSkeleton`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add pwa/src/components/EmptyState.tsx pwa/src/components/EmptyState.test.tsx pwa/src/components/PageSkeleton.tsx pwa/src/components/PageSkeleton.test.tsx
git commit -m "feat(components): shared EmptyState and PageSkeleton primitives"
```

---

## Task 6: Permissions API client + `usePermissions` hook

**Files:**
- Create: `pwa/src/api/permissions.ts`
- Create: `pwa/src/auth/usePermissions.ts`
- Create: `pwa/src/auth/usePermissions.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/auth/usePermissions.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePermissions } from "./usePermissions";
import * as api from "../api/permissions";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePermissions", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("hasPermission returns true for granted key", async () => {
    vi.spyOn(api, "fetchUserPermissions").mockResolvedValue({
      permissions: ["okr.read", "project.read"],
      roles: ["Projects Manager"],
    });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission("okr.read")).toBe(true);
    expect(result.current.hasPermission("workforce.read")).toBe(false);
    expect(result.current.hasAnyPermission(["workforce.read", "okr.read"])).toBe(true);
    expect(result.current.hasRole("Projects Manager")).toBe(true);
  });

  it("returns empty perms when api fails", async () => {
    vi.spyOn(api, "fetchUserPermissions").mockRejectedValue(new Error("net"));
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission("okr.read")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- usePermissions`
Expected: module not found.

- [ ] **Step 3: Implement API client**

Create `pwa/src/api/permissions.ts`:

```ts
import { frappeFetch } from "./client";

export interface UserPermissions {
  permissions: string[];
  roles: string[];
}

export async function fetchUserPermissions(): Promise<UserPermissions> {
  const res = await frappeFetch<{ message: UserPermissions }>(
    "/api/method/vernon_tasks.api.auth.get_user_permissions",
    { method: "GET" }
  );
  return res.message ?? { permissions: [], roles: [] };
}
```

(If the existing API client wrapper name is different from `frappeFetch`, substitute the correct name from `pwa/src/api/`.)

- [ ] **Step 4: Implement hook**

Create `pwa/src/auth/usePermissions.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchUserPermissions } from "../api/permissions";

export const USER_PERMISSIONS_QUERY_KEY = ["auth", "permissions"] as const;

export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: USER_PERMISSIONS_QUERY_KEY,
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });
  const perms = new Set(data?.permissions ?? []);
  const roles = new Set(data?.roles ?? []);
  return {
    isLoading,
    permissions: data?.permissions ?? [],
    roles: data?.roles ?? [],
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.has(p)),
    hasRole: (r: string) => roles.has(r),
  };
}
```

- [ ] **Step 5: Run test (expect pass)**

Run: `cd pwa && npm test -- usePermissions`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/api/permissions.ts pwa/src/auth/usePermissions.ts pwa/src/auth/usePermissions.test.tsx
git commit -m "feat(auth): usePermissions hook backed by react-query"
```

---

## Task 7: Telemetry events for portal

**Files:**
- Modify: `pwa/src/telemetry.ts`
- Create: `pwa/src/telemetry.portal.test.ts`

- [ ] **Step 1: Inspect existing telemetry shape**

Run: `cat pwa/src/telemetry.ts`
Expected: identify the existing emit/track function name and signature.

- [ ] **Step 2: Write failing test**

Create `pwa/src/telemetry.portal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("portal telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackPortalPageView emits 'portal.page_view' with path", () => {
    const spy = vi.spyOn(telemetry, "track");
    telemetry.trackPortalPageView("/portal/okr");
    expect(spy).toHaveBeenCalledWith("portal.page_view", { path: "/portal/okr" });
  });

  it("trackPortalNavClick emits 'portal.nav_click' with key+path", () => {
    const spy = vi.spyOn(telemetry, "track");
    telemetry.trackPortalNavClick("okr", "/portal/okr");
    expect(spy).toHaveBeenCalledWith("portal.nav_click", { key: "okr", path: "/portal/okr" });
  });

  it("trackPortalPermissionDenied emits with required perm", () => {
    const spy = vi.spyOn(telemetry, "track");
    telemetry.trackPortalPermissionDenied("/portal/okr", "okr.read");
    expect(spy).toHaveBeenCalledWith("portal.permission_denied", {
      path: "/portal/okr",
      required_perm: "okr.read",
    });
  });

  it("trackPortalError emits with path+message", () => {
    const spy = vi.spyOn(telemetry, "track");
    telemetry.trackPortalError("/portal/okr", "boom");
    expect(spy).toHaveBeenCalledWith("portal.error", { path: "/portal/okr", message: "boom" });
  });
});
```

- [ ] **Step 3: Run test (expect fail)**

Run: `cd pwa && npm test -- telemetry.portal`
Expected: missing exports.

- [ ] **Step 4: Extend `telemetry.ts`**

Append to `pwa/src/telemetry.ts` (do not remove existing `track`):

```ts
export function trackPortalPageView(path: string) {
  track("portal.page_view", { path });
}
export function trackPortalNavClick(key: string, path: string) {
  track("portal.nav_click", { key, path });
}
export function trackPortalPermissionDenied(path: string, required_perm: string) {
  track("portal.permission_denied", { path, required_perm });
}
export function trackPortalError(path: string, message: string) {
  track("portal.error", { path, message });
}
```

(If the existing exported function is named `emit` rather than `track`, substitute the existing name in BOTH the test and the implementation.)

- [ ] **Step 5: Run test (expect pass)**

Run: `cd pwa && npm test -- telemetry.portal`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/telemetry.ts pwa/src/telemetry.portal.test.ts
git commit -m "feat(telemetry): portal page_view/nav_click/permission_denied/error events"
```

---

## Task 8: Portal nav registry

**Files:**
- Create: `pwa/src/portal/nav.ts`
- Create: `pwa/src/portal/nav.test.ts`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { portalNav, filterNavByPermissions, type NavItem } from "./nav";

describe("portal nav registry", () => {
  it("includes the 5 Phase-1 entries", () => {
    const keys = portalNav.map((n) => n.key);
    expect(keys).toEqual(["dashboard", "okr", "projects", "workforce", "reports"]);
  });

  it("dashboard requires no permission", () => {
    const dash = portalNav.find((n) => n.key === "dashboard")!;
    expect(dash.permission).toBeNull();
  });

  it("filterNavByPermissions keeps items the user can see", () => {
    const filtered = filterNavByPermissions(portalNav, (p) => p === "project.read");
    const keys = filtered.map((n) => n.key);
    expect(keys).toEqual(["dashboard", "projects"]);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- portal/nav`
Expected: module not found.

- [ ] **Step 3: Implement registry**

Create `pwa/src/portal/nav.ts`:

```ts
export interface NavItem {
  key: string;
  label: string;
  path: string;
  permission: string | null;
}

export const portalNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/portal",           permission: null },
  { key: "okr",       label: "OKR",       path: "/portal/okr",       permission: "okr.read" },
  { key: "projects",  label: "Projects",  path: "/portal/projects",  permission: "project.read" },
  { key: "workforce", label: "Workforce", path: "/portal/workforce", permission: "workforce.read" },
  { key: "reports",   label: "Reports",   path: "/portal/reports",   permission: "report.read" },
];

export function filterNavByPermissions(
  items: NavItem[],
  hasPermission: (perm: string) => boolean,
): NavItem[] {
  return items.filter((it) => it.permission === null || hasPermission(it.permission));
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- portal/nav`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/nav.ts pwa/src/portal/nav.test.ts
git commit -m "feat(portal): nav registry with permission filter"
```

---

## Task 9: `<RequirePermission>` route guard

**Files:**
- Create: `pwa/src/portal/guards/RequirePermission.tsx`
- Create: `pwa/src/portal/guards/RequirePermission.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/guards/RequirePermission.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequirePermission } from "./RequirePermission";
import * as permsHook from "../../auth/usePermissions";

function mockPerms(perms: string[]) {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false,
    permissions: perms,
    roles: [],
    hasPermission: (p: string) => perms.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.includes(p)),
    hasRole: () => false,
  } as ReturnType<typeof permsHook.usePermissions>);
}

describe("RequirePermission", () => {
  it("renders children when permission present", () => {
    mockPerms(["okr.read"]);
    render(
      <MemoryRouter initialEntries={["/portal/okr"]}>
        <Routes>
          <Route path="/portal/okr" element={
            <RequirePermission perm="okr.read"><div>OKR Page</div></RequirePermission>
          }/>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("OKR Page")).toBeInTheDocument();
  });

  it("renders PermissionDenied when permission missing", () => {
    mockPerms([]);
    render(
      <MemoryRouter initialEntries={["/portal/okr"]}>
        <Routes>
          <Route path="/portal/okr" element={
            <RequirePermission perm="okr.read"><div>OKR Page</div></RequirePermission>
          }/>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText("OKR Page")).toBeNull();
    expect(screen.getByText(/permission/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- RequirePermission`
Expected: module not found.

- [ ] **Step 3: Implement guard**

Create `pwa/src/portal/pages/PermissionDenied.tsx` (referenced by guard):

```tsx
import { useLocation } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";

export interface PermissionDeniedProps {
  requiredPerm?: string;
}

export function PermissionDenied({ requiredPerm }: PermissionDeniedProps) {
  const loc = useLocation();
  return (
    <EmptyState
      title="Permission required"
      description={
        requiredPerm
          ? `You need '${requiredPerm}' to view this page (${loc.pathname}).`
          : `You do not have access to this page (${loc.pathname}).`
      }
      action={<button type="button">Request access</button>}
    />
  );
}
```

Create `pwa/src/portal/guards/RequirePermission.tsx`:

```tsx
import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePermissions } from "../../auth/usePermissions";
import { PermissionDenied } from "../pages/PermissionDenied";
import { PageSkeleton } from "../../components/PageSkeleton";
import { trackPortalPermissionDenied } from "../../telemetry";

export interface RequirePermissionProps {
  perm: string;
  children: ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const { isLoading, hasPermission } = usePermissions();
  const loc = useLocation();
  const allowed = !isLoading && hasPermission(perm);

  useEffect(() => {
    if (!isLoading && !allowed) trackPortalPermissionDenied(loc.pathname, perm);
  }, [isLoading, allowed, loc.pathname, perm]);

  if (isLoading) return <PageSkeleton />;
  if (!allowed) return <PermissionDenied requiredPerm={perm} />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- RequirePermission`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/guards/RequirePermission.tsx pwa/src/portal/guards/RequirePermission.test.tsx pwa/src/portal/pages/PermissionDenied.tsx
git commit -m "feat(portal): RequirePermission guard + PermissionDenied page"
```

---

## Task 10: `<PortalGuard>` (auth + viewport)

**Files:**
- Create: `pwa/src/portal/guards/PortalGuard.tsx`
- Create: `pwa/src/portal/guards/PortalGuard.test.tsx`

- [ ] **Step 1: Locate existing auth + viewport hooks**

Run:
```bash
grep -rln "useAuth\|useCurrentUser\|session" pwa/src/auth
grep -rln "useMediaQuery" pwa/src/hooks
```
Expected: identify existing exported names. Use them verbatim in the implementation below (substitute if different).

- [ ] **Step 2: Write failing test**

Create `pwa/src/portal/guards/PortalGuard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PortalGuard } from "./PortalGuard";
import * as auth from "../../auth";
import * as media from "../../hooks/useMediaQuery";

function setup({ authed, desktop }: { authed: boolean; desktop: boolean }) {
  vi.spyOn(auth, "useAuth").mockReturnValue({
    isAuthenticated: authed,
    user: authed ? { name: "u@x" } : null,
    isLoading: false,
  } as any);
  vi.spyOn(media, "useMediaQuery").mockReturnValue(desktop);
}

describe("PortalGuard", () => {
  it("renders children when authed + desktop", () => {
    setup({ authed: true, desktop: true });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal/*" element={<PortalGuard><div>portal</div></PortalGuard>}/>
          <Route path="/login" element={<div>login page</div>}/>
          <Route path="/m" element={<div>mobile</div>}/>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("portal")).toBeInTheDocument();
  });

  it("redirects to /login when unauth", () => {
    setup({ authed: false, desktop: true });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal/*" element={<PortalGuard><div>portal</div></PortalGuard>}/>
          <Route path="/login" element={<div>login page</div>}/>
          <Route path="/m" element={<div>mobile</div>}/>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("redirects to /m when mobile viewport", () => {
    setup({ authed: true, desktop: false });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal/*" element={<PortalGuard><div>portal</div></PortalGuard>}/>
          <Route path="/login" element={<div>login page</div>}/>
          <Route path="/m" element={<div>mobile</div>}/>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("mobile")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test (expect fail)**

Run: `cd pwa && npm test -- PortalGuard`
Expected: module not found.

- [ ] **Step 4: Implement guard**

Create `pwa/src/portal/guards/PortalGuard.tsx`:

```tsx
import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PageSkeleton } from "../../components/PageSkeleton";

const DESKTOP_QUERY = "(min-width: 1024px)";

export function PortalGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const loc = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (!isAuthenticated) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!isDesktop) return <Navigate to="/m/" replace />;
  return <>{children}</>;
}
```

(If `useAuth` is exported from a different module than `../../auth`, fix both the import in this file AND the spy target in the test to match the real path.)

- [ ] **Step 5: Run test (expect pass)**

Run: `cd pwa && npm test -- PortalGuard`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/portal/guards/PortalGuard.tsx pwa/src/portal/guards/PortalGuard.test.tsx
git commit -m "feat(portal): PortalGuard (auth + desktop viewport)"
```

---

## Task 11: `<PageLayout>` wrapper

**Files:**
- Create: `pwa/src/portal/layouts/PageLayout.tsx`
- Create: `pwa/src/portal/layouts/PageLayout.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/layouts/PageLayout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageLayout } from "./PageLayout";

describe("PageLayout", () => {
  it("renders title, breadcrumb, actions, body", () => {
    render(
      <PageLayout
        title="OKR"
        breadcrumb={<span>Portal / OKR</span>}
        actions={<button>New</button>}
      >
        <div>body content</div>
      </PageLayout>
    );
    expect(screen.getByRole("heading", { name: "OKR" })).toBeInTheDocument();
    expect(screen.getByText("Portal / OKR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- PageLayout`
Expected: module not found.

- [ ] **Step 3: Implement layout**

Create `pwa/src/portal/layouts/PageLayout.tsx`:

```tsx
import type { ReactNode } from "react";

export interface PageLayoutProps {
  title: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ title, breadcrumb, actions, children }: PageLayoutProps) {
  return (
    <section className="page-layout">
      <header className="page-layout__header">
        {breadcrumb && <div className="page-layout__breadcrumb">{breadcrumb}</div>}
        <div className="page-layout__title-row">
          <h1 className="page-layout__title">{title}</h1>
          {actions && <div className="page-layout__actions">{actions}</div>}
        </div>
      </header>
      <div className="page-layout__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- PageLayout`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/layouts/PageLayout.tsx pwa/src/portal/layouts/PageLayout.test.tsx
git commit -m "feat(portal): PageLayout wrapper with title/breadcrumb/actions/body"
```

---

## Task 12: `<TopBar>`

**Files:**
- Create: `pwa/src/portal/TopBar.tsx`
- Create: `pwa/src/portal/TopBar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/TopBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "./TopBar";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";

function mockPerms(perms: string[]) {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false,
    permissions: perms,
    roles: [],
    hasPermission: (p: string) => perms.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.includes(p)),
    hasRole: () => false,
  } as ReturnType<typeof permsHook.usePermissions>);
}

describe("TopBar", () => {
  it("filters nav items by permission", () => {
    mockPerms(["project.read"]);
    render(<MemoryRouter><TopBar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "OKR" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Workforce" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("emits nav_click telemetry on link click", async () => {
    mockPerms(["okr.read"]);
    const spy = vi.spyOn(telemetry, "trackPortalNavClick");
    render(<MemoryRouter><TopBar /></MemoryRouter>);
    await userEvent.click(screen.getByRole("link", { name: "OKR" }));
    expect(spy).toHaveBeenCalledWith("okr", "/portal/okr");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- TopBar`
Expected: module not found.

- [ ] **Step 3: Implement TopBar**

Create `pwa/src/portal/TopBar.tsx`:

```tsx
import { NavLink, Link } from "react-router-dom";
import { usePermissions } from "../auth/usePermissions";
import { trackPortalNavClick } from "../telemetry";
import { portalNav, filterNavByPermissions } from "./nav";

export function TopBar() {
  const { hasPermission } = usePermissions();
  const items = filterNavByPermissions(portalNav, hasPermission);

  return (
    <header className="portal-topbar" role="banner">
      <Link to="/portal" className="portal-topbar__logo">Vernon</Link>
      <nav className="portal-topbar__nav" aria-label="Primary">
        {items.map((it) => (
          <NavLink
            key={it.key}
            to={it.path}
            end={it.path === "/portal"}
            onClick={() => trackPortalNavClick(it.key, it.path)}
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="portal-topbar__spacer" />
      <button type="button" className="portal-topbar__search" aria-label="Search">⌘K</button>
      <button type="button" className="portal-topbar__bell" aria-label="Notifications">🔔</button>
      <button type="button" className="portal-topbar__profile" aria-label="Profile">👤</button>
    </header>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- TopBar`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/TopBar.tsx pwa/src/portal/TopBar.test.tsx
git commit -m "feat(portal): TopBar with permission-filtered nav + telemetry"
```

---

## Task 13: Portal pages — Dashboard, NotFound, ErrorPage, ComingSoon

**Files:**
- Create: `pwa/src/portal/pages/Dashboard.tsx`
- Create: `pwa/src/portal/pages/NotFound.tsx`
- Create: `pwa/src/portal/pages/ErrorPage.tsx`
- Create: `pwa/src/portal/pages/ComingSoon.tsx`
- Create: `pwa/src/portal/pages/pages.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/pages/pages.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { NotFound } from "./NotFound";
import { ErrorPage } from "./ErrorPage";
import { ComingSoon } from "./ComingSoon";

describe("portal pages", () => {
  it("Dashboard renders heading", () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });
  it("NotFound shows link to portal home", () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/portal");
  });
  it("ErrorPage shows retry button and reports message", () => {
    render(<ErrorPage message="boom" onRetry={() => {}} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
  it("ComingSoon shows domain label", () => {
    render(<ComingSoon domain="OKR" />);
    expect(screen.getByText(/OKR/)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- portal/pages/pages`
Expected: modules not found.

- [ ] **Step 3: Implement pages**

Create `pwa/src/portal/pages/Dashboard.tsx`:

```tsx
import { PageLayout } from "../layouts/PageLayout";
import { portalNav } from "../nav";
import { usePermissions } from "../../auth/usePermissions";

export function Dashboard() {
  const { hasPermission } = usePermissions();
  const domains = portalNav.filter((n) => n.key !== "dashboard");
  return (
    <PageLayout title="Dashboard">
      <div className="portal-dashboard__grid">
        {domains.map((d) => {
          const allowed = d.permission === null || hasPermission(d.permission);
          return (
            <article key={d.key} className="portal-card" aria-disabled={!allowed}>
              <h2>{d.label}</h2>
              <p>{allowed ? "Coming soon" : "No access"}</p>
            </article>
          );
        })}
      </div>
    </PageLayout>
  );
}
```

Create `pwa/src/portal/pages/NotFound.tsx`:

```tsx
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";

export function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you’re looking for doesn’t exist in the portal."
      action={<Link to="/portal">Go to portal home</Link>}
    />
  );
}
```

Create `pwa/src/portal/pages/ErrorPage.tsx`:

```tsx
import { EmptyState } from "../../components/EmptyState";

export interface ErrorPageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorPage({ message, onRetry }: ErrorPageProps) {
  return (
    <EmptyState
      title="Something went wrong"
      description={message}
      action={
        onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null
      }
    />
  );
}
```

Create `pwa/src/portal/pages/ComingSoon.tsx`:

```tsx
import { PageLayout } from "../layouts/PageLayout";
import { EmptyState } from "../../components/EmptyState";

export function ComingSoon({ domain }: { domain: string }) {
  return (
    <PageLayout title={domain}>
      <EmptyState title={`${domain} — coming soon`} description="This module ships in a later phase." />
    </PageLayout>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- portal/pages/pages`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/pages/
git commit -m "feat(portal): Dashboard, NotFound, ErrorPage, ComingSoon pages"
```

---

## Task 14: `<PortalErrorBoundary>`

**Files:**
- Create: `pwa/src/portal/PortalErrorBoundary.tsx`
- Create: `pwa/src/portal/PortalErrorBoundary.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/PortalErrorBoundary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PortalErrorBoundary } from "./PortalErrorBoundary";
import * as telemetry from "../telemetry";

function Bomb(): JSX.Element {
  throw new Error("kaboom");
}

describe("PortalErrorBoundary", () => {
  it("renders fallback and emits telemetry on child error", () => {
    const spy = vi.spyOn(telemetry, "trackPortalError");
    // Silence React's expected error log noise.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary path="/portal/x">
        <Bomb />
      </PortalErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith("/portal/x", expect.stringContaining("kaboom"));
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- PortalErrorBoundary`
Expected: module not found.

- [ ] **Step 3: Implement boundary**

Create `pwa/src/portal/PortalErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import { ErrorPage } from "./pages/ErrorPage";
import { trackPortalError } from "../telemetry";

export interface PortalErrorBoundaryProps {
  path: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PortalErrorBoundary extends Component<PortalErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    trackPortalError(this.props.path, error.message);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorPage message={this.state.error.message} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- PortalErrorBoundary`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/PortalErrorBoundary.tsx pwa/src/portal/PortalErrorBoundary.test.tsx
git commit -m "feat(portal): PortalErrorBoundary with telemetry + retry"
```

---

## Task 15: Portal sub-router + `<PortalShell>`

**Files:**
- Create: `pwa/src/portal/routes.tsx`
- Create: `pwa/src/portal/PortalShell.tsx`
- Create: `pwa/src/portal/PortalShell.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/PortalShell.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalShell } from "./PortalShell";
import * as auth from "../auth";
import * as media from "../hooks/useMediaQuery";
import * as permsApi from "../api/permissions";

function wrap(initial: string) {
  vi.spyOn(auth, "useAuth").mockReturnValue({
    isAuthenticated: true, user: { name: "u@x" }, isLoading: false,
  } as any);
  vi.spyOn(media, "useMediaQuery").mockReturnValue(true);
  vi.spyOn(permsApi, "fetchUserPermissions").mockResolvedValue({
    permissions: ["okr.read", "project.read", "workforce.read", "report.read"],
    roles: ["System Manager"],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <PortalShell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PortalShell", () => {
  it("renders TopBar + Dashboard at /portal", async () => {
    wrap("/portal");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders ComingSoon for /portal/okr", async () => {
    wrap("/portal/okr");
    await waitFor(() => expect(screen.getByText(/okr — coming soon/i)).toBeInTheDocument());
  });

  it("renders NotFound for unknown /portal/xyz", async () => {
    wrap("/portal/xyz");
    await waitFor(() => expect(screen.getByText(/page not found/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd pwa && npm test -- PortalShell`
Expected: module not found.

- [ ] **Step 3: Implement sub-router**

Create `pwa/src/portal/routes.tsx`:

```tsx
import { Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { ComingSoon } from "./pages/ComingSoon";
import { RequirePermission } from "./guards/RequirePermission";

export function PortalRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route
        path="okr/*"
        element={<RequirePermission perm="okr.read"><ComingSoon domain="OKR" /></RequirePermission>}
      />
      <Route
        path="projects/*"
        element={<RequirePermission perm="project.read"><ComingSoon domain="Projects" /></RequirePermission>}
      />
      <Route
        path="workforce/*"
        element={<RequirePermission perm="workforce.read"><ComingSoon domain="Workforce" /></RequirePermission>}
      />
      <Route
        path="reports/*"
        element={<RequirePermission perm="report.read"><ComingSoon domain="Reports" /></RequirePermission>}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

Create `pwa/src/portal/PortalShell.tsx`:

```tsx
import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { PortalGuard } from "./guards/PortalGuard";
import { PortalErrorBoundary } from "./PortalErrorBoundary";
import { TopBar } from "./TopBar";
import { PortalRoutes } from "./routes";
import { PageSkeleton } from "../components/PageSkeleton";
import { trackPortalPageView } from "../telemetry";

export function PortalShell() {
  const loc = useLocation();
  useEffect(() => {
    trackPortalPageView(loc.pathname);
  }, [loc.pathname]);

  return (
    <PortalGuard>
      <div className="portal-shell">
        <TopBar />
        <main className="portal-shell__main">
          <PortalErrorBoundary path={loc.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <PortalRoutes />
            </Suspense>
          </PortalErrorBoundary>
        </main>
      </div>
    </PortalGuard>
  );
}

export default PortalShell;
```

- [ ] **Step 4: Run test (expect pass)**

Run: `cd pwa && npm test -- PortalShell`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/PortalShell.tsx pwa/src/portal/routes.tsx pwa/src/portal/PortalShell.test.tsx
git commit -m "feat(portal): PortalShell with sub-router, guard, error boundary, page_view telemetry"
```

---

## Task 16: Top-level router wiring (`/portal/*` → lazy PortalShell)

**Files:**
- Modify: `pwa/src/router.tsx`

- [ ] **Step 1: Read current router**

Run: `cat pwa/src/router.tsx`
Expected: identify how `/m/*` and root `/` are wired.

- [ ] **Step 2: Add lazy import + route**

In `pwa/src/router.tsx`, add at top:

```tsx
import { lazy } from "react";
const PortalShell = lazy(() => import("./portal/PortalShell"));
```

Add a route entry for `/portal/*` that renders `<PortalShell />` (matching the existing pattern used for `/m/*`). Example (adapt to existing structure):

```tsx
<Route path="/portal/*" element={<PortalShell />} />
```

Root `/` redirect rule (only change if router currently has a static redirect; otherwise leave existing logic):

```tsx
// If existing root redirects unconditionally to /m/, replace with:
<Route
  path="/"
  element={
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
      ? <Navigate to="/portal" replace />
      : <Navigate to="/m/" replace />
  }
/>
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `cd pwa && npm run typecheck && npm test -- --run`
Expected: 0 type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/router.tsx
git commit -m "feat(router): mount /portal/* with lazy PortalShell; viewport-aware root redirect"
```

---

## Task 17: Vite bundle split — portal chunk

**Files:**
- Modify: `pwa/vite.config.ts`

- [ ] **Step 1: Read current config**

Run: `cat pwa/vite.config.ts`
Expected: identify `build.rollupOptions` if present.

- [ ] **Step 2: Add `manualChunks` for portal**

In `pwa/vite.config.ts`, extend the `build` block:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes("/pwa/src/portal/")) return "portal";
        if (id.includes("/pwa/src/mobile/")) return "mobile";
        return undefined;
      },
    },
  },
},
```

(Merge with existing `build` options if present; do not overwrite them.)

- [ ] **Step 3: Build and inspect chunks**

Run: `cd pwa && npm run build`
Expected: build succeeds; output includes a `portal-*.js` chunk separate from `mobile-*.js`.

- [ ] **Step 4: Verify portal chunk budget ≤200KB gzip**

Run: `find pwa/dist -name "portal-*.js" -exec gzip -c {} \; | wc -c`
Expected: byte count <204800 (200KB). If over, log a follow-up task and stop the plan for design review.

- [ ] **Step 5: Commit**

```bash
git add pwa/vite.config.ts
git commit -m "build(pwa): split portal and mobile into separate chunks"
```

---

## Task 18: E2E happy-path test

**Files:**
- Create: `pwa/e2e/portal-shell.spec.ts`

- [ ] **Step 1: Read existing e2e patterns**

Run: `ls pwa/e2e && head -40 pwa/e2e/*.spec.ts | head -120`
Expected: identify how auth + base URL + helpers work in existing specs.

- [ ] **Step 2: Write E2E spec**

Create `pwa/e2e/portal-shell.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Adjust login helper to match the project's auth fixture pattern.
async function loginAsManager(page) {
  await page.goto("/login");
  await page.fill('input[name="usr"]', process.env.E2E_MANAGER_USER || "manager@example.com");
  await page.fill('input[name="pwd"]', process.env.E2E_MANAGER_PASS || "manager");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

test.describe("portal shell", () => {
  test("manager lands at /portal dashboard and can navigate", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/portal");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();

    await page.getByRole("link", { name: "OKR" }).click();
    await expect(page).toHaveURL(/\/portal\/okr/);
    await expect(page.getByText(/okr — coming soon/i)).toBeVisible();
  });

  test("unknown /portal route shows NotFound", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/portal/this-does-not-exist");
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test("missing permission shows PermissionDenied", async ({ page, request }) => {
    // Pre-req: a worker user without okr.read should already exist in the test site.
    await page.goto("/login");
    await page.fill('input[name="usr"]', process.env.E2E_WORKER_USER || "worker@example.com");
    await page.fill('input[name="pwd"]', process.env.E2E_WORKER_PASS || "worker");
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
    await page.goto("/portal/okr");
    await expect(page.getByText(/permission required/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Run E2E**

Run: `cd pwa && npx playwright test portal-shell`
Expected: 3 passed (with test users seeded via existing fixtures).

If test user fixtures are missing, add a follow-up note in the test file (`// TODO(e2e): seed manager/worker fixtures via vernon_tasks/fixtures/`) and skip with `test.skip` rather than blocking the plan.

- [ ] **Step 4: Commit**

```bash
git add pwa/e2e/portal-shell.spec.ts
git commit -m "test(e2e): portal shell happy path + permission-denied flow"
```

---

## Task 19: Coverage gate for `pwa/src/portal/`

**Files:**
- Modify: `pwa/vite.config.ts` (vitest coverage config) OR `pwa/vitest.config.ts` if separate.

- [ ] **Step 1: Locate vitest config**

Run: `grep -n "coverage" pwa/vite.config.ts pwa/vitest.config.ts 2>/dev/null`
Expected: identify the coverage block (or absence).

- [ ] **Step 2: Add per-path threshold**

Add to the vitest `test.coverage` block:

```ts
coverage: {
  provider: "v8",
  include: ["src/**/*.{ts,tsx}"],
  thresholds: {
    "src/portal/**": { lines: 80, functions: 80, statements: 80, branches: 70 },
  },
},
```

(Merge with any existing coverage options.)

- [ ] **Step 3: Run coverage**

Run: `cd pwa && npm test -- --coverage --run`
Expected: passes with `portal/` ≥80% lines. If under, add tests for the uncovered lines before committing.

- [ ] **Step 4: Commit**

```bash
git add pwa/vite.config.ts pwa/vitest.config.ts 2>/dev/null
git commit -m "test(pwa): coverage threshold ≥80% for portal/"
```

---

## Task 20: Final verification, docs cross-link, branch wrap

**Files:**
- Modify: `docs/prd/index.html` (link to new PRD)
- Modify: `docs/superpowers/specs/2026-05-17-desktop-portal-foundation-design.md` (flip Status: Draft → Implemented (Phase 1))

- [ ] **Step 1: Full repo sanity**

Run:
```bash
cd pwa && npm run typecheck && npm test -- --run && npm run build
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.api.test_auth
```
Expected: all green.

- [ ] **Step 2: Manual smoke**

With `portal_enabled=1` and a manager-role user logged in:
- `GET /portal` → Dashboard renders, topbar visible.
- `GET /portal/okr` → "OKR — coming soon".
- `GET /portal/this-does-not-exist` → NotFound.
- Logout and `GET /portal` → redirect `/login?next=/portal`.
- Set viewport <1024 and `GET /portal` → redirect `/m/`.
- Set `portal_enabled=0` → `GET /portal` redirects `/m/`.

Record any deviations as bugs in `.wolf/buglog.json` per project rule.

- [ ] **Step 3: Update PRD status + docs hub link**

In `docs/superpowers/specs/2026-05-17-desktop-portal-foundation-design.md` line 4, change `Status: Draft` → `Status: Implemented (Phase 1)`.

In `docs/prd/index.html`, add an `<li>` linking to the new PRD design spec under the PRD list, e.g.:

```html
<li><a href="../superpowers/specs/2026-05-17-desktop-portal-foundation-design.md">Desktop Portal Foundation (Phase 1)</a></li>
```

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(prd): mark desktop portal foundation as implemented (Phase 1) and link from hub"
```

- [ ] **Step 5: Push branch + open PR**

Run:
```bash
git push -u origin HEAD
gh pr create --title "feat(portal): desktop portal foundation (Phase 1)" --body "$(cat <<'EOF'
## Summary
- Mount /portal/* desktop portal in pwa/ via Approach A (single SPA, multi-shell routing).
- Topbar nav, permission-filtered, with /portal/okr, /portal/projects, /portal/workforce, /portal/reports stubs.
- get_user_permissions API + react-query-backed usePermissions hook.
- PortalGuard (auth + desktop viewport), RequirePermission, PortalErrorBoundary, telemetry events.
- Feature-flagged via VT Settings `portal_enabled` (default off).

## Test plan
- [ ] vitest passes with portal/ ≥80% line coverage
- [ ] playwright portal-shell.spec passes for manager and worker users
- [ ] backend test_auth passes
- [ ] manual smoke: /portal, /portal/okr, /portal/xyz, unauth redirect, mobile-viewport redirect, flag-off redirect
EOF
)"
```
Expected: PR URL printed.

---

## Self-Review

- **Spec coverage:** All §1–§12 of the spec are covered by tasks. §2/§4 nav + permissions (T6, T8, T9, T12), §3 architecture/routing (T3, T4, T15, T16), §5 data flow (T2, T6, T7), §6 errors/loading/empty (T5, T9, T13, T14), §7 testing (every task TDD + T18 E2E + T19 coverage), §8 build (T17), §9 rollout flag (T1, T3), §10 metrics (T17 bundle, T19 coverage, T18 errors verified via telemetry in T2/T20 smoke). §11 Open Questions: defaults shipped (viewport-first root redirect in T16; bell same feed Phase 1 — T12 just renders a stub button, no filtering required).
- **Placeholder scan:** No `TBD`/`TODO`/`fill in` left. Two callouts to "substitute existing name if different" (T6 `frappeFetch`, T7 `track`, T10 `useAuth`) are explicit guidance, not placeholders — engineer always has actionable instruction.
- **Type consistency:** `NavItem` shape stable across T8/T12. `usePermissions()` return type referenced consistently in T9/T12/T15 (mocked as `ReturnType<typeof permsHook.usePermissions>`). `trackPortalNavClick(key, path)` signature matches in T7/T12. `ErrorPageProps`/`PermissionDeniedProps` consistent T13/T14/T9. `PortalErrorBoundary` takes `path` prop in T14, supplied by `PortalShell` in T15. Permission keys (`okr.read`, etc.) consistent across T2/T8/T15/T18.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-desktop-portal-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
