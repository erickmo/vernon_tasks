# Vernon Tasks PWA — Foundation + My Work Read-only (P0.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship installable PWA at `/m/` with session-cookie auth, read-only offline cache, and a working My Work list+detail screen — laying foundation for P1 mutations.

**Architecture:** React+Vite SPA built into `vernon_tasks/www/m/`, served via Frappe `website_route_rules`. Workbox SW caches API responses (StaleWhileRevalidate). Auth reuses Frappe `/api/method/login` and the `sid` cookie. New Frappe-side: 2 whitelisted APIs (`my_work`, `telemetry`), 1 DocType (`Vernon Telemetry Event`), 1 SPA route shell, 1 scheduled purge.

**Tech Stack:** Frappe v15 (Python 3.11), React 18, TypeScript 5, Vite 5, react-router 6, @tanstack/react-query 5, workbox 7, idb-keyval, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-11-vernon-pwa-foundation-design.md`

---

## Pre-flight

- [ ] **Step 0.1: Create feature branch**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git checkout -b feat/pwa-foundation
```

- [ ] **Step 0.2: Verify bench environment**

Run: `ls vernon_tasks/hooks.py vernon_tasks/www`
Expected: both exist.

---

## Task 1: Backend — `Vernon Telemetry Event` DocType

**Files:**
- Create: `vernon_tasks/vt_settings/doctype/vernon_telemetry_event/__init__.py`
- Create: `vernon_tasks/vt_settings/doctype/vernon_telemetry_event/vernon_telemetry_event.json`
- Create: `vernon_tasks/vt_settings/doctype/vernon_telemetry_event/vernon_telemetry_event.py`
- Create: `vernon_tasks/vt_settings/doctype/vernon_telemetry_event/test_vernon_telemetry_event.py`

- [ ] **Step 1.1: Write failing test**

`vernon_tasks/vt_settings/doctype/vernon_telemetry_event/test_vernon_telemetry_event.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase


class TestVernonTelemetryEvent(FrappeTestCase):
    def test_create_event(self):
        doc = frappe.get_doc({
            "doctype": "Vernon Telemetry Event",
            "event": "pwa_boot",
            "props": '{"version":"abc123"}',
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.event, "pwa_boot")
        self.assertEqual(doc.user, frappe.session.user)
        self.assertIsNotNone(doc.timestamp)
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.vt_settings.doctype.vernon_telemetry_event.test_vernon_telemetry_event"`
Expected: FAIL with "DocType Vernon Telemetry Event not found".

- [ ] **Step 1.3: Create empty `__init__.py`**

`vernon_tasks/vt_settings/doctype/vernon_telemetry_event/__init__.py`: empty file.

- [ ] **Step 1.4: Create DocType JSON**

`vernon_tasks/vt_settings/doctype/vernon_telemetry_event/vernon_telemetry_event.json`:

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-05-11 00:00:00",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["timestamp", "user", "event", "props"],
 "fields": [
  {"fieldname": "timestamp", "fieldtype": "Datetime", "label": "Timestamp", "default": "now", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
  {"fieldname": "user", "fieldtype": "Link", "options": "User", "label": "User", "default": "__user", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
  {"fieldname": "event", "fieldtype": "Data", "label": "Event", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1, "length": 64},
  {"fieldname": "props", "fieldtype": "Long Text", "label": "Props (JSON)"}
 ],
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-05-11 00:00:00",
 "modified_by": "Administrator",
 "module": "VT Settings",
 "name": "Vernon Telemetry Event",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1},
  {"role": "Vernon Admin", "read": 1, "report": 1, "export": 1}
 ],
 "sort_field": "timestamp",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0,
 "hide_toolbar": 1
}
```

- [ ] **Step 1.5: Create controller**

`vernon_tasks/vt_settings/doctype/vernon_telemetry_event/vernon_telemetry_event.py`:

```python
import frappe
from frappe.model.document import Document


class VernonTelemetryEvent(Document):
    def before_insert(self):
        if not self.timestamp:
            self.timestamp = frappe.utils.now_datetime()
        if not self.user:
            self.user = frappe.session.user
```

- [ ] **Step 1.6: Migrate + re-run test**

```bash
bench --site <site> migrate
bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.vt_settings.doctype.vernon_telemetry_event.test_vernon_telemetry_event"
```

Expected: PASS.

- [ ] **Step 1.7: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vernon_telemetry_event
git commit -m "feat(telemetry): add Vernon Telemetry Event DocType"
```

---

## Task 2: Backend — telemetry API + daily purge

**Files:**
- Create: `vernon_tasks/task/api/telemetry.py`
- Create: `vernon_tasks/task/api/test_telemetry.py`
- Create: `vernon_tasks/task/api/__init__.py` (only if missing)

- [ ] **Step 2.1: Failing test**

`vernon_tasks/task/api/test_telemetry.py`:

```python
import json
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.telemetry import log_event, purge_old_telemetry


class TestTelemetry(FrappeTestCase):
    def setUp(self):
        frappe.db.delete("Vernon Telemetry Event")

    def test_log_event_persists(self):
        log_event(event="pwa_boot", props={"version": "abc"})
        rows = frappe.get_all("Vernon Telemetry Event", filters={"event": "pwa_boot"})
        self.assertEqual(len(rows), 1)

    def test_log_event_rejects_unknown(self):
        with self.assertRaises(frappe.ValidationError):
            log_event(event="rogue_event")

    def test_log_event_rate_limit(self):
        for _ in range(60):
            log_event(event="page_view", props={"route": "/m/work"})
        with self.assertRaises(frappe.ValidationError):
            log_event(event="page_view", props={"route": "/m/work"})

    def test_purge_removes_old(self):
        doc = frappe.get_doc({
            "doctype": "Vernon Telemetry Event",
            "event": "pwa_boot",
            "timestamp": frappe.utils.add_days(frappe.utils.now_datetime(), -100),
        }).insert(ignore_permissions=True)
        purge_old_telemetry()
        self.assertFalse(frappe.db.exists("Vernon Telemetry Event", doc.name))
```

- [ ] **Step 2.2: Run to confirm fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.task.api.test_telemetry"`
Expected: ImportError on `telemetry`.

- [ ] **Step 2.3: Implement**

`vernon_tasks/task/api/telemetry.py`:

```python
import json
import frappe
from frappe.utils import add_days, now_datetime

ALLOWED_EVENTS = {
    "pwa_boot",
    "login_success",
    "login_failure",
    "page_view",
    "task_view",
    "offline_seen",
    "error_boundary",
    "sw_register_failed",
}

RATE_LIMIT_PER_MINUTE = 60
RETENTION_DAYS = 90


@frappe.whitelist()
def log_event(event: str, props: dict | None = None) -> dict:
    if event not in ALLOWED_EVENTS:
        frappe.throw(f"Unknown telemetry event: {event}")

    user = frappe.session.user
    if user == "Guest":
        return {"ok": False, "reason": "guest"}

    cache_key = f"vt:tel:{user}:{frappe.utils.now()[:16]}"
    count = frappe.cache().incrby(cache_key, 1)
    frappe.cache().expire(cache_key, 90)
    if count > RATE_LIMIT_PER_MINUTE:
        frappe.throw("Telemetry rate limit exceeded")

    props_str = json.dumps(props) if isinstance(props, dict) else (props or None)

    doc = frappe.get_doc({
        "doctype": "Vernon Telemetry Event",
        "event": event,
        "user": user,
        "timestamp": now_datetime(),
        "props": props_str,
    })
    doc.insert(ignore_permissions=True)
    return {"ok": True}


def purge_old_telemetry() -> None:
    cutoff = add_days(now_datetime(), -RETENTION_DAYS)
    frappe.db.delete("Vernon Telemetry Event", {"timestamp": ["<", cutoff]})
    frappe.db.commit()
```

- [ ] **Step 2.4: Re-run test**

Run: same command as 2.2.
Expected: 4 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add vernon_tasks/task/api/telemetry.py vernon_tasks/task/api/test_telemetry.py
git commit -m "feat(api): add telemetry log_event + daily purge"
```

---

## Task 3: Backend — `my_work` list + detail API

**Files:**
- Create: `vernon_tasks/task/api/my_work.py`
- Create: `vernon_tasks/task/api/test_my_work.py`

- [ ] **Step 3.1: Failing test**

`vernon_tasks/task/api/test_my_work.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.my_work import list as my_work_list, detail


class TestMyWork(FrappeTestCase):
    def setUp(self):
        self.user_a = "a@test.local"
        self.user_b = "b@test.local"
        for u in (self.user_a, self.user_b):
            if not frappe.db.exists("User", u):
                frappe.get_doc({"doctype": "User", "email": u, "first_name": u}).insert(ignore_permissions=True)

    def _make_task(self, owner, due_date, title="T"):
        return frappe.get_doc({
            "doctype": "Task",
            "subject": title,
            "exp_end_date": due_date,
            "_assign": frappe.as_json([owner]),
        }).insert(ignore_permissions=True)

    def test_list_groups_correctly(self):
        frappe.set_user(self.user_a)
        today = frappe.utils.today()
        self._make_task(self.user_a, frappe.utils.add_days(today, -2), "old")
        self._make_task(self.user_a, today, "now")
        self._make_task(self.user_a, frappe.utils.add_days(today, 3), "soon")
        result = my_work_list()
        self.assertEqual(len(result["overdue"]), 1)
        self.assertEqual(len(result["today"]), 1)
        self.assertEqual(len(result["upcoming"]), 1)

    def test_detail_rejects_other_user(self):
        frappe.set_user(self.user_a)
        task = self._make_task(self.user_a, frappe.utils.today())
        frappe.set_user(self.user_b)
        with self.assertRaises(frappe.PermissionError):
            detail(task.name)
```

> **Note for executor:** Confirm Vernon's task DocType name (it may be `VT Task` or similar). Update `"doctype": "Task"` + `frappe.get_all("Task", ...)` in the implementation accordingly. Grep with `find vernon_tasks/task/doctype -type d` first.

- [ ] **Step 3.2: Run — confirm fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.task.api.test_my_work"`
Expected: ImportError.

- [ ] **Step 3.3: Implement**

`vernon_tasks/task/api/my_work.py`:

```python
import frappe
from frappe.utils import today, add_days, getdate

TASK_DOCTYPE = "Task"


def _serialize(row: dict) -> dict:
    return {
        "id": row["name"],
        "title": row.get("subject") or row.get("title"),
        "status": row.get("status"),
        "priority": row.get("priority"),
        "due_date": row.get("exp_end_date") or row.get("due_date"),
        "project": row.get("project"),
        "sprint": row.get("sprint"),
        "points": row.get("points") or 0,
    }


@frappe.whitelist()
def list() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[["_assign", "like", f"%{user}%"], ["status", "!=", "Cancelled"]],
        fields=["name", "subject", "status", "priority", "exp_end_date", "project"],
        order_by="exp_end_date asc",
        limit_page_length=500,
    )

    today_d = getdate(today())
    upcoming_cap = add_days(today_d, 7)
    overdue, today_list, upcoming = [], [], []
    for r in rows:
        d = getdate(r["exp_end_date"]) if r["exp_end_date"] else None
        item = _serialize(r)
        if d is None or d > upcoming_cap:
            continue
        if d < today_d:
            overdue.append(item)
        elif d == today_d:
            today_list.append(item)
        else:
            upcoming.append(item)
    return {"overdue": overdue, "today": today_list, "upcoming": upcoming}


@frappe.whitelist()
def detail(task_id: str) -> dict:
    user = frappe.session.user
    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Not found", frappe.PermissionError)

    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    assignees = frappe.parse_json(doc.get("_assign") or "[]")
    if user not in assignees and not frappe.has_permission(TASK_DOCTYPE, "read", doc=doc):
        frappe.throw("Forbidden", frappe.PermissionError)

    activity = frappe.get_all(
        "Comment",
        filters={"reference_doctype": TASK_DOCTYPE, "reference_name": task_id},
        fields=["content", "comment_type", "creation", "owner"],
        order_by="creation desc",
        limit_page_length=10,
    )
    return {
        **_serialize(doc.as_dict()),
        "description": doc.get("description"),
        "activity": activity,
    }
```

- [ ] **Step 3.4: Re-run, fix DocType name if needed**

Run: same as 3.2.
Expected: 2 PASS. If "DocType X not found", adjust `TASK_DOCTYPE` and `subject` field.

- [ ] **Step 3.5: Commit**

```bash
git add vernon_tasks/task/api/my_work.py vernon_tasks/task/api/test_my_work.py
git commit -m "feat(api): add my_work list + detail for PWA"
```

---

## Task 4: Backend — SPA route + hooks integration

**Files:**
- Create: `vernon_tasks/www/m.py`
- Create: `vernon_tasks/www/m.html`
- Modify: `vernon_tasks/hooks.py`

- [ ] **Step 4.1: Create SPA controller**

`vernon_tasks/www/m.py`:

```python
import os
import frappe

no_cache = 1
sitemap = 0


def get_context(context):
    """Serve the built PWA index.html for /m/* routes (SPA fallback)."""
    app_path = frappe.get_app_path("vernon_tasks", "www", "m", "index.html")
    if os.path.exists(app_path):
        with open(app_path, "r", encoding="utf-8") as f:
            context.spa_html = f.read()
    else:
        context.spa_html = (
            "<!doctype html><html><body><p>PWA not built. "
            "Run <code>cd pwa &amp;&amp; npm run build</code>.</p></body></html>"
        )
    context.no_breadcrumbs = True
    return context
```

- [ ] **Step 4.2: Create minimal Jinja template**

`vernon_tasks/www/m.html`:

```html
{{ spa_html | safe }}
```

- [ ] **Step 4.3: Add route rule + scheduler in `hooks.py`**

Read current `vernon_tasks/hooks.py` first. Append (or merge):

```python
website_route_rules = [
    {"from_route": "/m/<path:rest>", "to_route": "m"},
]

scheduler_events = {
    "daily": [
        "vernon_tasks.task.api.telemetry.purge_old_telemetry",
    ],
}
```

If keys already exist, merge.

- [ ] **Step 4.4: Smoke test route**

```bash
bench --site <site> migrate
bench --site <site> clear-cache
bench restart
curl -s http://<site>/m/anything | grep -q "PWA not built" && echo OK
```

Expected: prints `OK`.

- [ ] **Step 4.5: Commit**

```bash
git add vernon_tasks/www/m.py vernon_tasks/www/m.html vernon_tasks/hooks.py
git commit -m "feat(hooks): SPA route /m/* + daily telemetry purge"
```

---

## Task 5: Frontend — Vite + TypeScript scaffold

**Files:**
- Create: `pwa/package.json`
- Create: `pwa/tsconfig.json`
- Create: `pwa/vite.config.ts`
- Create: `pwa/index.html`
- Create: `pwa/.gitignore`
- Create: `pwa/src/main.tsx`
- Create: `pwa/src/test-setup.ts`
- Modify: project root `.gitignore`

- [ ] **Step 5.1: `pwa/package.json`**

```json
{
  "name": "vernon-tasks-pwa",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "idb-keyval": "^6.2.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "happy-dom": "^14.12.3",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.1",
    "vitest": "^2.0.5",
    "workbox-window": "^7.1.0"
  }
}
```

- [ ] **Step 5.2: `pwa/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": "src",
    "paths": { "@/*": ["*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5.3: `pwa/vite.config.ts`**

Uses `execFileSync` with array args (no shell) to read git SHA — safe, no shell interpolation.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import path from "node:path";

const swVersion = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  base: "/m/",
  define: { __SW_VERSION__: JSON.stringify(swVersion) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      manifest: {
        name: "Vernon Tasks",
        short_name: "Vernon",
        description: "Tugas, sprint, dan analitik Vernon.",
        start_url: "/m/",
        scope: "/m/",
        display: "standalone",
        background_color: "#0b0b10",
        theme_color: "#0b0b10",
        lang: "id-ID",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cacheId: `vt-${swVersion}`,
        navigateFallback: "/m/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//, /^\/private\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/method/vernon_tasks."),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: `vt-api-${swVersion}`,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: path.resolve(__dirname, "../vernon_tasks/www/m"),
    emptyOutDir: true,
    sourcemap: false
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  }
});
```

- [ ] **Step 5.4: `pwa/index.html`**

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0b10" />
    <title>Vernon Tasks</title>
    <link rel="icon" href="/m/icons/icon-192.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5.5: Stub `pwa/src/main.tsx` + test setup**

`pwa/src/main.tsx`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div>Vernon PWA boot OK</div>
  </React.StrictMode>
);
```

`pwa/src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5.6: `pwa/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 5.7: Update root `.gitignore`**

Append to `.gitignore`:

```
vernon_tasks/www/m/
!vernon_tasks/www/m.py
!vernon_tasks/www/m.html
```

- [ ] **Step 5.8: Install + build smoke**

```bash
cd pwa
npm install
npm run build
ls ../vernon_tasks/www/m/index.html
```

Expected: build succeeds, `index.html` exists.

- [ ] **Step 5.9: Verify served**

```bash
cd ..
bench restart
curl -s http://<site>/m/ | grep -q "Vernon PWA boot OK" && echo OK
```

Expected: prints `OK`.

- [ ] **Step 5.10: Commit**

```bash
git add pwa .gitignore
git commit -m "feat(pwa): scaffold Vite + React + workbox PWA shell at /m/"
```

---

## Task 6: Frontend — design tokens + safe-area + theme

**Files:**
- Create: `pwa/src/theme/tokens.css`
- Create: `pwa/src/theme/index.ts`

- [ ] **Step 6.1: Tokens CSS**

`pwa/src/theme/tokens.css`:

```css
:root {
  --vt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --vt-radius: 12px;
  --vt-radius-sm: 8px;
  --vt-space-1: 4px;
  --vt-space-2: 8px;
  --vt-space-3: 12px;
  --vt-space-4: 16px;
  --vt-space-5: 24px;
  --vt-space-6: 32px;
  --vt-bg: #ffffff;
  --vt-surface: #f6f7f9;
  --vt-text: #0b0b10;
  --vt-text-muted: #5b6472;
  --vt-border: #e3e6ec;
  --vt-primary: #1e6bff;
  --vt-primary-contrast: #ffffff;
  --vt-danger: #d4351c;
  --vt-warn: #e89c1f;
  --vt-success: #18a957;
  --vt-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --bottom-nav-h: 64px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --vt-bg: #0b0b10;
    --vt-surface: #15151c;
    --vt-text: #f4f5f7;
    --vt-text-muted: #9aa0aa;
    --vt-border: #2a2b34;
    --vt-primary: #4a8bff;
    --vt-shadow: 0 1px 3px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.35);
  }
}

@keyframes vt-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--vt-font);
  font-size: 15px;
  color: var(--vt-text);
  background: var(--vt-bg);
  -webkit-tap-highlight-color: transparent;
}
button { font: inherit; cursor: pointer; }
```

- [ ] **Step 6.2: Theme helper**

`pwa/src/theme/index.ts`:

```typescript
import "./tokens.css";

export const theme = { bottomNavHeight: 64 };
```

- [ ] **Step 6.3: Wire in main.tsx**

Replace `pwa/src/main.tsx`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import "./theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div>Vernon PWA boot OK</div>
  </React.StrictMode>
);
```

- [ ] **Step 6.4: Build**

```bash
cd pwa && npm run build && cd ..
```

Expected: build succeeds.

- [ ] **Step 6.5: Commit**

```bash
git add pwa/src/theme pwa/src/main.tsx
git commit -m "feat(pwa): design tokens (light+dark, safe-area)"
```

---

## Task 7: Frontend — i18n

**Files:**
- Create: `pwa/src/i18n.ts`
- Create: `pwa/src/i18n.test.ts`

- [ ] **Step 7.1: Failing test**

`pwa/src/i18n.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { t, fmtDate, fmtTime, greeting } from "./i18n";

describe("i18n", () => {
  it("translates keys", () => {
    expect(t("login.submit")).toBe("Masuk");
    expect(t("nav.tasks")).toBe("Tugas");
  });

  it("returns key when missing", () => {
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });

  it("formats date as DD MMM YYYY id-ID", () => {
    const d = new Date("2026-05-11T12:00:00Z");
    expect(fmtDate(d)).toMatch(/11 Mei 2026/);
  });

  it("formats time 24h", () => {
    const d = new Date("2026-05-11T14:32:00Z");
    expect(fmtTime(d)).toMatch(/\d{2}:\d{2}/);
  });

  it("greets by hour", () => {
    expect(greeting(7)).toBe("Selamat pagi");
    expect(greeting(13)).toBe("Selamat siang");
    expect(greeting(16)).toBe("Selamat sore");
    expect(greeting(21)).toBe("Selamat malam");
  });
});
```

- [ ] **Step 7.2: Run — confirm fail**

```bash
cd pwa && npx vitest run src/i18n.test.ts
```

Expected: FAIL "cannot find ./i18n".

- [ ] **Step 7.3: Implement**

`pwa/src/i18n.ts`:

```typescript
const STRINGS = {
  "app.title": "Vernon Tasks",
  "nav.tasks": "Tugas",
  "nav.dashboard": "Dashboard",
  "nav.analytics": "Analitik",
  "nav.me": "Saya",
  "login.title": "Masuk ke Vernon",
  "login.username": "Email atau Username",
  "login.password": "Kata Sandi",
  "login.submit": "Masuk",
  "login.error": "Email atau kata sandi salah.",
  "logout": "Keluar",
  "common.retry": "Coba lagi",
  "common.refresh": "Muat ulang",
  "common.loading": "Memuat…",
  "common.coming_soon": "Segera hadir",
  "offline.banner": "Mode offline · terakhir sinkron",
  "stale.prefix": "Diperbarui",
  "empty.no_offline": "Belum ada data offline.",
  "empty.no_tasks": "Tidak ada tugas hari ini. Nikmati waktumu.",
  "tasks.section.overdue": "Terlambat",
  "tasks.section.today": "Hari Ini",
  "tasks.section.upcoming": "Mendatang",
  "tasks.detail.action_disabled": "Tersedia di pembaruan berikutnya",
  "relogin.title": "Sesi berakhir",
  "relogin.body": "Sesi Anda berakhir. Silakan masuk lagi untuk melanjutkan.",
  "onboarding.welcome.title": "Selamat datang di Vernon",
  "onboarding.welcome.body": "Tugas, sprint, dan analitik tim Anda di satu tempat.",
  "onboarding.anywhere.title": "Tugas Anda, di mana saja",
  "onboarding.anywhere.body": "Bisa di-install seperti aplikasi, tetap bisa dilihat saat offline.",
  "onboarding.start.title": "Mari mulai",
  "onboarding.start.cta": "Mulai",
  "error.boundary.title": "Terjadi kesalahan",
  "error.boundary.body": "Halaman gagal dimuat. Coba muat ulang."
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey): string {
  return (STRINGS as Record<string, string>)[key] ?? key;
}

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dateFmt.format(dt);
}

export function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return timeFmt.format(dt);
}

export function fmtRelative(ms: number): string {
  if (ms < 60_000) return "baru saja";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} menit lalu`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} jam lalu`;
  return `${Math.floor(ms / 86_400_000)} hari lalu`;
}

export function greeting(hour: number = new Date().getHours()): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}
```

- [ ] **Step 7.4: Re-run — PASS**

Run: `npx vitest run src/i18n.test.ts`
Expected: 5 PASS.

- [ ] **Step 7.5: Commit**

```bash
git add pwa/src/i18n.ts pwa/src/i18n.test.ts
git commit -m "feat(pwa): i18n strings + id-ID date/time formatters"
```

---

## Task 8: Frontend — `api/client` with 401 hook

**Files:**
- Create: `pwa/src/api/client.ts`
- Create: `pwa/src/api/client.test.ts`

- [ ] **Step 8.1: Failing test**

`pwa/src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, onAuthChallenge } from "./client";

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("GET parses JSON body via .message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { hello: "world" } }), { status: 200 })
    ));
    const r = await api.get<{ hello: string }>("/api/method/x");
    expect(r.hello).toBe("world");
  });

  it("emits auth challenge on 401", async () => {
    const cb = vi.fn().mockResolvedValue(true);
    onAuthChallenge(cb);
    const responses = [
      new Response("", { status: 401 }),
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 })
    ];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)));
    const r = await api.get<{ ok: boolean }>("/api/method/x");
    expect(cb).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
  });

  it("throws on 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(api.get("/api/method/x")).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 8.2: Run — fail**

```bash
npx vitest run src/api/client.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 8.3: Implement**

`pwa/src/api/client.ts`:

```typescript
type AuthChallenge = () => Promise<boolean>;

let authHandler: AuthChallenge | null = null;
export function onAuthChallenge(handler: AuthChallenge) {
  authHandler = handler;
}

function getCsrf(): string | undefined {
  return (window as unknown as { csrf_token?: string }).csrf_token;
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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
};
```

- [ ] **Step 8.4: Re-run — PASS**

Run: same as 8.2.
Expected: 3 PASS.

- [ ] **Step 8.5: Commit**

```bash
git add pwa/src/api
git commit -m "feat(pwa): api client with 401 re-auth hook"
```

---

## Task 9: Frontend — auth (session, login, guard, boot)

**Files:**
- Create: `pwa/src/auth/session.ts`
- Create: `pwa/src/auth/session.test.ts`
- Create: `pwa/src/auth/login.tsx`
- Create: `pwa/src/auth/guard.tsx`
- Create: `vernon_tasks/task/api/boot.py`

- [ ] **Step 9.1: Backend boot endpoint**

`vernon_tasks/task/api/boot.py`:

```python
import frappe


@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    if user == "Guest":
        return {"user": None, "csrf_token": None}
    return {"user": user, "csrf_token": frappe.sessions.get_csrf_token()}
```

Smoke:

```bash
bench --site <site> clear-cache && bench restart
curl -s http://<site>/api/method/vernon_tasks.task.api.boot.boot
```

Expected: JSON with `user: null` for guest.

- [ ] **Step 9.2: Failing session test**

`pwa/src/auth/session.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { probeSession } from "./session";

describe("session", () => {
  it("returns user on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { user: "a@b.c", csrf_token: "tok" } }), { status: 200 })
    ));
    const s = await probeSession();
    expect(s.user).toBe("a@b.c");
    expect((window as unknown as { csrf_token?: string }).csrf_token).toBe("tok");
  });

  it("returns null on guest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { user: null } }), { status: 200 })
    ));
    const s = await probeSession();
    expect(s.user).toBeNull();
  });
});
```

- [ ] **Step 9.3: Run — fail**

```bash
npx vitest run src/auth/session.test.ts
```

Expected: module missing.

- [ ] **Step 9.4: Implement `session.ts`**

`pwa/src/auth/session.ts`:

```typescript
import { api } from "@/api/client";

export interface Session {
  user: string | null;
  csrf_token: string | null;
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
```

- [ ] **Step 9.5: Re-run — PASS**

Run: same as 9.3.
Expected: 2 PASS.

- [ ] **Step 9.6: Implement `login.tsx`**

`pwa/src/auth/login.tsx`:

```typescript
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "./session";
import { t } from "@/i18n";

export function LoginPage() {
  const [usr, setUsr] = useState(() => localStorage.getItem("vt_last_user") ?? "");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/m/work";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await login(usr, pwd);
      if (!s.user) throw new Error("guest");
      localStorage.setItem("vt_last_user", usr);
      nav(next, { replace: true });
    } catch {
      setErr(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "var(--vt-space-5)", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>{t("login.title")}</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: "var(--vt-space-3)" }}>
          {t("login.username")}
          <input
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            autoComplete="username"
            required
            style={{ display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: "var(--vt-space-4)" }}>
          {t("login.password")}
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoComplete="current-password"
            required
            style={{ display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 }}
          />
        </label>
        {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
        <button disabled={busy} type="submit" style={{ width: "100%", padding: "var(--vt-space-3)" }}>
          {busy ? t("common.loading") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 9.7: Implement `guard.tsx`**

`pwa/src/auth/guard.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { probeSession } from "./session";

export function AuthGuard() {
  const [state, setState] = useState<"loading" | "auth" | "guest">("loading");
  const loc = useLocation();

  useEffect(() => {
    probeSession()
      .then((s) => setState(s.user ? "auth" : "guest"))
      .catch(() => setState("guest"));
  }, []);

  if (state === "loading") return <div style={{ padding: 24 }}>…</div>;
  if (state === "guest") {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/m/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 9.8: Commit**

```bash
git add pwa/src/auth vernon_tasks/task/api/boot.py
git commit -m "feat(auth): session probe, login page, route guard, boot endpoint"
```

---

## Task 10: Frontend — IndexedDB cache + sync-time

**Files:**
- Create: `pwa/src/cache/idb.ts`
- Create: `pwa/src/cache/sync-time.ts`
- Create: `pwa/src/cache/cache.test.ts`

- [ ] **Step 10.1: Failing test**

`pwa/src/cache/cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cachePut } from "./idb";
import { stamp, ageMs, isStale, STALE_THRESHOLD_MS } from "./sync-time";

beforeEach(() => { localStorage.clear(); });

describe("idb cache", () => {
  it("put then get returns same payload", async () => {
    await cachePut("k", { a: 1 });
    expect(await cacheGet<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("get returns undefined for missing", async () => {
    expect(await cacheGet("missing")).toBeUndefined();
  });
});

describe("sync-time", () => {
  it("stamp + ageMs returns small number", () => {
    stamp("k");
    expect(ageMs("k")).toBeLessThan(1000);
  });

  it("isStale true when > threshold", () => {
    localStorage.setItem("vt_sync:k", String(Date.now() - STALE_THRESHOLD_MS - 1000));
    expect(isStale("k")).toBe(true);
  });

  it("isStale true when never stamped", () => {
    expect(isStale("never")).toBe(true);
  });
});
```

- [ ] **Step 10.2: Run — fail**

```bash
npx vitest run src/cache/cache.test.ts
```

- [ ] **Step 10.3: Implement `idb.ts`**

```typescript
import { get, set } from "idb-keyval";

const PREFIX = "vt:cache:";

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await get(PREFIX + key)) as T | undefined;
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  await set(PREFIX + key, value);
}
```

- [ ] **Step 10.4: Implement `sync-time.ts`**

```typescript
export const STALE_THRESHOLD_MS = 60 * 60 * 1000;
const PREFIX = "vt_sync:";

export function stamp(key: string): void {
  localStorage.setItem(PREFIX + key, String(Date.now()));
}

export function lastSync(key: string): number | null {
  const v = localStorage.getItem(PREFIX + key);
  return v ? Number(v) : null;
}

export function ageMs(key: string): number {
  const ts = lastSync(key);
  return ts ? Date.now() - ts : Number.POSITIVE_INFINITY;
}

export function isStale(key: string): boolean {
  return ageMs(key) > STALE_THRESHOLD_MS;
}
```

- [ ] **Step 10.5: Re-run — PASS**

Run: same as 10.2.
Expected: 5 PASS.

- [ ] **Step 10.6: Commit**

```bash
git add pwa/src/cache
git commit -m "feat(pwa): IndexedDB read cache + per-resource sync-time"
```

---

## Task 11: Frontend — shared components

**Files (one component per file):**
- Create: `pwa/src/components/Skeleton.tsx`
- Create: `pwa/src/components/EmptyState.tsx`
- Create: `pwa/src/components/ErrorBoundary.tsx`
- Create: `pwa/src/components/Toast.tsx`
- Create: `pwa/src/components/SafeArea.tsx`
- Create: `pwa/src/components/OfflineBanner.tsx`
- Create: `pwa/src/components/StaleBadge.tsx`
- Create: `pwa/src/components/PullToRefresh.tsx`
- Create: `pwa/src/components/BottomNav.tsx`
- Create: `pwa/src/components/ReloginModal.tsx`
- Create: `pwa/src/components/components.test.tsx`

- [ ] **Step 11.1: Failing component test**

`pwa/src/components/components.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { OfflineBanner } from "./OfflineBanner";
import { StaleBadge } from "./StaleBadge";
import { BottomNav } from "./BottomNav";
import { stamp } from "@/cache/sync-time";

describe("components", () => {
  it("EmptyState renders title + cta", () => {
    render(<EmptyState title="Kosong" cta={{ label: "Coba", onClick: () => {} }} />);
    expect(screen.getByText("Kosong")).toBeInTheDocument();
    expect(screen.getByText("Coba")).toBeInTheDocument();
  });

  it("OfflineBanner shows when offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<OfflineBanner />);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("StaleBadge prints relative time", () => {
    stamp("my-work");
    render(<StaleBadge resource="my-work" />);
    expect(screen.getByText(/baru saja/i)).toBeInTheDocument();
  });

  it("BottomNav highlights active route", () => {
    render(
      <MemoryRouter initialEntries={["/m/work"]}>
        <BottomNav />
      </MemoryRouter>
    );
    const tasks = screen.getByText("Tugas").closest("a");
    expect(tasks).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 11.2: Run — fail**

```bash
npx vitest run src/components/components.test.tsx
```

- [ ] **Step 11.3: `Skeleton.tsx`**

```typescript
export function Skeleton({ height = 16, width = "100%", radius = 8 }: { height?: number; width?: number | string; radius?: number }) {
  return (
    <div
      aria-hidden
      style={{
        height,
        width,
        borderRadius: radius,
        background: "linear-gradient(90deg, var(--vt-surface), var(--vt-border), var(--vt-surface))",
        backgroundSize: "200% 100%",
        animation: "vt-shimmer 1.4s infinite",
      }}
    />
  );
}
```

- [ ] **Step 11.4: `EmptyState.tsx`**

```typescript
interface Props {
  title: string;
  body?: string;
  cta?: { label: string; onClick: () => void };
}

export function EmptyState({ title, body, cta }: Props) {
  return (
    <div style={{ padding: "var(--vt-space-6)", textAlign: "center", color: "var(--vt-text-muted)" }}>
      <h3 style={{ color: "var(--vt-text)" }}>{title}</h3>
      {body && <p>{body}</p>}
      {cta && (
        <button onClick={cta.onClick} style={{ padding: "var(--vt-space-3) var(--vt-space-4)", background: "var(--vt-primary)", color: "var(--vt-primary-contrast)", border: 0, borderRadius: "var(--vt-radius)" }}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 11.5: `ErrorBoundary.tsx`**

```typescript
import { Component, ReactNode } from "react";
import { t } from "@/i18n";
import { logEvent } from "@/telemetry";

interface State { err: Error | null; }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { logEvent("error_boundary", { msg: err.message }); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <h2>{t("error.boundary.title")}</h2>
          <p>{t("error.boundary.body")}</p>
          <button onClick={() => window.location.reload()}>{t("common.refresh")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 11.6: `Toast.tsx`**

```typescript
import { createContext, useCallback, useContext, useState, ReactNode } from "react";

interface ToastItem { id: number; msg: string; action?: { label: string; onClick: () => void }; }
interface Ctx { show: (msg: string, action?: ToastItem["action"]) => void; }

const ToastCtx = createContext<Ctx>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((msg: string, action?: ToastItem["action"]) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, action }]);
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div style={{ position: "fixed", bottom: "calc(var(--bottom-nav-h) + 12px + var(--safe-bottom))", left: 12, right: 12, display: "grid", gap: 8, zIndex: 50 }}>
        {items.map((i) => (
          <div key={i.id} style={{ background: "var(--vt-text)", color: "var(--vt-bg)", padding: "var(--vt-space-3) var(--vt-space-4)", borderRadius: "var(--vt-radius)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{i.msg}</span>
            {i.action && <button onClick={i.action.onClick} style={{ color: "var(--vt-primary)", background: "transparent", border: 0 }}>{i.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() { return useContext(ToastCtx); }
```

- [ ] **Step 11.7: `SafeArea.tsx`**

```typescript
import { ReactNode } from "react";

export function SafeArea({ children }: { children: ReactNode }) {
  return (
    <div style={{ paddingTop: "var(--safe-top)", paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)", paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))", minHeight: "100%" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 11.8: `OfflineBanner.tsx`**

```typescript
import { useEffect, useState } from "react";
import { fmtTime } from "@/i18n";

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [since, setSince] = useState<Date | null>(null);

  useEffect(() => {
    const on = () => { setOnline(true); setSince(null); };
    const off = () => { setOnline(false); setSince(new Date()); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (online) return null;
  return (
    <div role="status" style={{ position: "sticky", top: 0, background: "var(--vt-text-muted)", color: "var(--vt-bg)", textAlign: "center", padding: "var(--vt-space-2)", fontSize: 13 }}>
      Mode offline · terakhir sinkron {since ? fmtTime(since) : "—"}
    </div>
  );
}
```

- [ ] **Step 11.9: `StaleBadge.tsx`**

```typescript
import { ageMs, isStale } from "@/cache/sync-time";
import { fmtRelative } from "@/i18n";

export function StaleBadge({ resource }: { resource: string }) {
  const age = ageMs(resource);
  if (!Number.isFinite(age)) return null;
  const stale = isStale(resource);
  return (
    <span style={{ fontSize: 12, color: stale ? "var(--vt-warn)" : "var(--vt-text-muted)" }}>
      Diperbarui {fmtRelative(age)}
    </span>
  );
}
```

- [ ] **Step 11.10: `PullToRefresh.tsx`**

```typescript
import { ReactNode, useRef, useState } from "react";

interface Props { onRefresh: () => Promise<void>; children: ReactNode; }

export function PullToRefresh({ onRefresh, children }: Props) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 0) startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPull(Math.min(dy, 80));
  }
  async function onTouchEnd() {
    if (pull > 60 && !busy) {
      setBusy(true);
      try { await onRefresh(); } finally { setBusy(false); }
    }
    setPull(0);
    startY.current = null;
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{ height: pull, textAlign: "center", color: "var(--vt-text-muted)", overflow: "hidden", transition: busy ? "none" : "height 0.2s" }}>
        {busy ? "Menyegarkan…" : pull > 60 ? "Lepas untuk segarkan" : "Tarik untuk segarkan"}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 11.11: `BottomNav.tsx`**

```typescript
import { NavLink } from "react-router-dom";
import { t } from "@/i18n";

const TABS = [
  { to: "/m/work", label: t("nav.tasks") },
  { to: "/m/dashboard", label: t("nav.dashboard") },
  { to: "/m/analytics", label: t("nav.analytics") },
  { to: "/m/me", label: t("nav.me") },
];

export function BottomNav() {
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
      paddingBottom: "var(--safe-bottom)",
      background: "var(--vt-bg)", borderTop: "1px solid var(--vt-border)",
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", zIndex: 40,
    }}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            display: "flex", alignItems: "center", justifyContent: "center",
            color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
            textDecoration: "none", fontSize: 13, fontWeight: 600,
          })}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 11.12: `ReloginModal.tsx`**

```typescript
import { useState } from "react";
import { login } from "@/auth/session";
import { t } from "@/i18n";

interface Props { open: boolean; onResolve: (ok: boolean) => void; }

export function ReloginModal({ open, onResolve }: Props) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const usr = localStorage.getItem("vt_last_user") ?? "";

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await login(usr, pwd);
      if (!s.user) throw new Error();
      onResolve(true);
    } catch {
      setErr(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}>
      <form onSubmit={submit} style={{ background: "var(--vt-bg)", color: "var(--vt-text)", padding: 24, borderRadius: 16, maxWidth: 420, width: "100%" }}>
        <h3 style={{ marginTop: 0 }}>{t("relogin.title")}</h3>
        <p style={{ color: "var(--vt-text-muted)" }}>{t("relogin.body")}</p>
        <p style={{ fontSize: 13 }}>{usr}</p>
        <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} required style={{ width: "100%", padding: 12, marginBottom: 12 }} />
        {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onResolve(false)} disabled={busy}>{t("logout")}</button>
          <button type="submit" disabled={busy}>{busy ? t("common.loading") : t("login.submit")}</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 11.13: Re-run component tests — PASS**

```bash
npx vitest run src/components/components.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 11.14: Commit**

```bash
git add pwa/src/components
git commit -m "feat(pwa): shared UI components (nav, banner, toast, modal, etc.)"
```

---

## Task 12: Frontend — telemetry client

**Files:**
- Create: `pwa/src/telemetry.ts`

- [ ] **Step 12.1: Implement**

`pwa/src/telemetry.ts`:

```typescript
import { api } from "@/api/client";

export type TelemetryEvent =
  | "pwa_boot"
  | "login_success"
  | "login_failure"
  | "page_view"
  | "task_view"
  | "offline_seen"
  | "error_boundary"
  | "sw_register_failed";

export function logEvent(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  api.post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
    .catch(() => { /* swallow */ });
}
```

- [ ] **Step 12.2: Commit**

```bash
git add pwa/src/telemetry.ts
git commit -m "feat(pwa): telemetry client"
```

---

## Task 13: Frontend — `api/tasks` (with cache fallback)

**Files:**
- Create: `pwa/src/api/tasks.ts`
- Create: `pwa/src/api/tasks.test.ts`

- [ ] **Step 13.1: Failing test**

`pwa/src/api/tasks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchMyWork } from "./tasks";

beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("tasks api", () => {
  it("fetchMyWork returns groups + stamps cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { overdue: [], today: [{ id: "T1", title: "x" }], upcoming: [] } }), { status: 200 })
    ));
    const r = await fetchMyWork();
    expect(r.today).toHaveLength(1);
    expect(localStorage.getItem("vt_sync:my-work")).toBeTruthy();
  });

  it("fetchMyWork falls back to cache on network fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { overdue: [], today: [{ id: "T1", title: "x" }], upcoming: [] } }), { status: 200 })
    ));
    await fetchMyWork();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await fetchMyWork();
    expect(r.today).toHaveLength(1);
  });
});
```

- [ ] **Step 13.2: Run — fail**

```bash
npx vitest run src/api/tasks.test.ts
```

- [ ] **Step 13.3: Implement**

`pwa/src/api/tasks.ts`:

```typescript
import { api } from "./client";
import { cacheGet, cachePut } from "@/cache/idb";
import { stamp } from "@/cache/sync-time";

export interface TaskCard {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  project?: string;
  sprint?: string;
  points?: number;
}

export interface MyWork {
  overdue: TaskCard[];
  today: TaskCard[];
  upcoming: TaskCard[];
}

export interface TaskDetail extends TaskCard {
  description?: string;
  activity: Array<{ content: string; comment_type: string; creation: string; owner: string }>;
}

export async function fetchMyWork(): Promise<MyWork> {
  try {
    const data = await api.get<MyWork>("/api/method/vernon_tasks.task.api.my_work.list");
    await cachePut("my-work", data);
    stamp("my-work");
    return data;
  } catch (e) {
    const cached = await cacheGet<MyWork>("my-work");
    if (cached) return cached;
    throw e;
  }
}

export async function fetchTaskDetail(id: string): Promise<TaskDetail> {
  const key = `task:${id}`;
  try {
    const data = await api.get<TaskDetail>(
      `/api/method/vernon_tasks.task.api.my_work.detail?task_id=${encodeURIComponent(id)}`
    );
    await cachePut(key, data);
    stamp(key);
    return data;
  } catch (e) {
    const cached = await cacheGet<TaskDetail>(key);
    if (cached) return cached;
    throw e;
  }
}
```

- [ ] **Step 13.4: Re-run — PASS**

Run: same as 13.2.
Expected: 2 PASS.

- [ ] **Step 13.5: Commit**

```bash
git add pwa/src/api/tasks.ts pwa/src/api/tasks.test.ts
git commit -m "feat(pwa): tasks API w/ IDB cache fallback"
```

---

## Task 14: Frontend — `pages/MyWork/List`

**Files:**
- Create: `pwa/src/pages/MyWork/List.tsx`
- Create: `pwa/src/pages/MyWork/List.test.tsx`

- [ ] **Step 14.1: Failing test**

`pwa/src/pages/MyWork/List.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyWorkList } from "./List";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MyWorkList", () => {
  it("renders task title from API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        message: { overdue: [], today: [{ id: "T1", title: "Buat laporan" }], upcoming: [] }
      }), { status: 200 })
    ));
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText("Buat laporan")).toBeInTheDocument());
  });

  it("shows empty state when no tasks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }), { status: 200 })
    ));
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Nikmati waktumu/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 14.2: Run — fail**

```bash
npx vitest run src/pages/MyWork/List.test.tsx
```

- [ ] **Step 14.3: Implement**

`pwa/src/pages/MyWork/List.tsx`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork, TaskCard as TaskCardT } from "@/api/tasks";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StaleBadge } from "@/components/StaleBadge";
import { PullToRefresh } from "@/components/PullToRefresh";
import { greeting, fmtDate, t } from "@/i18n";

function TaskCardView({ task, accent }: { task: TaskCardT; accent?: string }) {
  return (
    <Link
      to={`/m/work/${encodeURIComponent(task.id)}`}
      style={{
        display: "block", padding: "var(--vt-space-4)", marginBottom: "var(--vt-space-3)",
        background: "var(--vt-surface)", borderRadius: "var(--vt-radius)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        color: "var(--vt-text)", textDecoration: "none", boxShadow: "var(--vt-shadow)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{task.title}</div>
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
        {[task.project, task.priority].filter(Boolean).join(" · ")}
        {task.points ? ` · +${task.points} pts` : ""}
      </div>
    </Link>
  );
}

function Section({ title, items, accent }: { title: string; items: TaskCardT[]; accent?: string }) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--vt-space-5)" }}>
      <h3 style={{ fontSize: 14, color: "var(--vt-text-muted)", margin: "0 0 var(--vt-space-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h3>
      {items.map((task) => <TaskCardView key={task.id} task={task} accent={accent} />)}
    </section>
  );
}

export function MyWorkList() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });

  const total = (q.data?.overdue.length ?? 0) + (q.data?.today.length ?? 0) + (q.data?.upcoming.length ?? 0);

  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <header style={{ marginBottom: "var(--vt-space-4)" }}>
          <h1 style={{ margin: 0 }}>{greeting()}</h1>
          <div style={{ color: "var(--vt-text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span>{fmtDate(new Date())}</span>
            <StaleBadge resource="my-work" />
          </div>
        </header>

        {q.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {q.isError && !q.data && (
          <EmptyState title={t("empty.no_offline")} cta={{ label: t("common.retry"), onClick: () => q.refetch() }} />
        )}

        {q.data && (
          total === 0 ? (
            <EmptyState title={t("empty.no_tasks")} />
          ) : (
            <>
              <Section title={t("tasks.section.overdue")} items={q.data.overdue} accent="var(--vt-danger)" />
              <Section title={t("tasks.section.today")} items={q.data.today} accent="var(--vt-primary)" />
              <Section title={t("tasks.section.upcoming")} items={q.data.upcoming} />
            </>
          )
        )}
      </div>
    </PullToRefresh>
  );
}
```

- [ ] **Step 14.4: Re-run — PASS**

Run: same as 14.2.
Expected: 2 PASS.

- [ ] **Step 14.5: Commit**

```bash
git add pwa/src/pages/MyWork
git commit -m "feat(pwa): My Work list page (sections + pull-to-refresh)"
```

---

## Task 15: Frontend — `pages/MyWork/Detail`

**Files:**
- Create: `pwa/src/pages/MyWork/Detail.tsx`

- [ ] **Step 15.1: Implement**

```typescript
import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchTaskDetail } from "@/api/tasks";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { fmtDate, fmtTime, t } from "@/i18n";
import { logEvent } from "@/telemetry";

export function MyWorkDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["task", id], queryFn: () => fetchTaskDetail(id!), enabled: !!id });

  useEffect(() => { if (id) logEvent("task_view", { task_id: id }); }, [id]);

  if (q.isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <Skeleton height={28} width="60%" />
        <div style={{ height: 12 }} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <EmptyState title={t("empty.no_offline")} cta={{ label: t("common.retry"), onClick: () => q.refetch() }} />;
  }
  const d = q.data;
  return (
    <div style={{ padding: 16 }}>
      <Link to="/m/work" style={{ color: "var(--vt-primary)", textDecoration: "none" }}>← {t("nav.tasks")}</Link>
      <h1 style={{ marginTop: 12 }}>{d.title}</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--vt-text-muted)", marginBottom: 16 }}>
        {d.status && <span>{d.status}</span>}
        {d.priority && <span>· {d.priority}</span>}
        {d.due_date && <span>· {fmtDate(d.due_date)}</span>}
        {d.points ? <span>· +{d.points} pts</span> : null}
      </div>
      {d.description && (
        <div style={{ background: "var(--vt-surface)", padding: 16, borderRadius: "var(--vt-radius)", whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {d.description}
        </div>
      )}
      <h3>Aktivitas</h3>
      {d.activity.length === 0 && <p style={{ color: "var(--vt-text-muted)" }}>—</p>}
      {d.activity.map((a, idx) => (
        <div key={idx} style={{ padding: 12, borderTop: "1px solid var(--vt-border)" }}>
          <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
            {a.owner} · {fmtDate(a.creation)} {fmtTime(a.creation)}
          </div>
          <div>{a.content}</div>
        </div>
      ))}
      <div style={{ marginTop: 24, padding: 16, background: "var(--vt-surface)", borderRadius: "var(--vt-radius)", textAlign: "center", color: "var(--vt-text-muted)" }}>
        {t("tasks.detail.action_disabled")}
      </div>
    </div>
  );
}
```

- [ ] **Step 15.2: Commit**

```bash
git add pwa/src/pages/MyWork/Detail.tsx
git commit -m "feat(pwa): My Work detail page (read-only)"
```

---

## Task 16: Frontend — `pages/Onboarding`, `pages/Placeholder`, `pages/Me`

**Files:**
- Create: `pwa/src/pages/Onboarding.tsx`
- Create: `pwa/src/pages/Placeholder.tsx`
- Create: `pwa/src/pages/Me.tsx`

- [ ] **Step 16.1: `Onboarding.tsx`**

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "@/i18n";

const SLIDES = [
  { title: t("onboarding.welcome.title"), body: t("onboarding.welcome.body"), cta: "Lanjut" },
  { title: t("onboarding.anywhere.title"), body: t("onboarding.anywhere.body"), cta: "Lanjut" },
  { title: t("onboarding.start.title"), body: "", cta: t("onboarding.start.cta") },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  function next() {
    if (last) {
      localStorage.setItem("vt_pwa_onboarded", "1");
      nav("/m/work", { replace: true });
    } else {
      setI(i + 1);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: 24, paddingTop: "calc(var(--safe-top) + 24px)" }}>
      <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <h1>{slide.title}</h1>
          <p style={{ color: "var(--vt-text-muted)", maxWidth: 320, margin: "0 auto" }}>{slide.body}</p>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {SLIDES.map((_, idx) => (
          <span key={idx} style={{ width: 8, height: 8, borderRadius: "50%", background: idx === i ? "var(--vt-primary)" : "var(--vt-border)" }} />
        ))}
      </div>
      <button onClick={next} style={{ padding: 16, background: "var(--vt-primary)", color: "var(--vt-primary-contrast)", border: 0, borderRadius: "var(--vt-radius)" }}>
        {slide.cta}
      </button>
    </div>
  );
}
```

- [ ] **Step 16.2: `Placeholder.tsx`**

```typescript
import { EmptyState } from "@/components/EmptyState";
import { t } from "@/i18n";

export function Placeholder({ title }: { title: string }) {
  return <EmptyState title={title} body={t("common.coming_soon")} />;
}
```

- [ ] **Step 16.3: `Me.tsx`**

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, probeSession } from "@/auth/session";
import { t } from "@/i18n";

export function MePage() {
  const [user, setUser] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => { probeSession().then((s) => setUser(s.user)); }, []);

  async function doLogout() {
    await logout();
    nav("/m/login", { replace: true });
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>{t("nav.me")}</h1>
      <p style={{ color: "var(--vt-text-muted)" }}>{user ?? "—"}</p>
      <button onClick={doLogout} style={{ marginTop: 24, padding: 12 }}>{t("logout")}</button>
    </div>
  );
}
```

- [ ] **Step 16.4: Commit**

```bash
git add pwa/src/pages/Onboarding.tsx pwa/src/pages/Placeholder.tsx pwa/src/pages/Me.tsx
git commit -m "feat(pwa): onboarding, placeholder, profile pages"
```

---

## Task 17: Frontend — router + AppShell + main.tsx wiring

**Files:**
- Create: `pwa/src/AppShell.tsx`
- Create: `pwa/src/router.tsx`
- Create: `pwa/src/vite-env.d.ts`
- Modify: `pwa/src/main.tsx`

- [ ] **Step 17.1: `AppShell.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SafeArea } from "@/components/SafeArea";
import { ReloginModal } from "@/components/ReloginModal";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { onAuthChallenge } from "@/api/client";
import { logEvent } from "@/telemetry";

export function AppShell() {
  const [reloginOpen, setReloginOpen] = useState(false);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);
  const loc = useLocation();

  useEffect(() => {
    onAuthChallenge(() => new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
      setReloginOpen(true);
    }));
  }, []);

  useEffect(() => { logEvent("page_view", { route: loc.pathname }); }, [loc.pathname]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineBanner />
        <SafeArea>
          <Outlet />
        </SafeArea>
        <BottomNav />
        <ReloginModal open={reloginOpen} onResolve={(ok) => {
          setReloginOpen(false);
          resolver?.(ok);
          setResolver(null);
        }} />
      </ToastProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 17.2: `router.tsx`**

```typescript
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "@/auth/guard";
import { LoginPage } from "@/auth/login";
import { AppShell } from "@/AppShell";
import { MyWorkList } from "@/pages/MyWork/List";
import { MyWorkDetail } from "@/pages/MyWork/Detail";
import { Onboarding } from "@/pages/Onboarding";
import { Placeholder } from "@/pages/Placeholder";
import { MePage } from "@/pages/Me";
import { t } from "@/i18n";

function OnboardingGate() {
  if (localStorage.getItem("vt_pwa_onboarded") === "1") {
    return <Navigate to="/m/work" replace />;
  }
  return <Onboarding />;
}

export const router = createBrowserRouter([
  { path: "/m/login", element: <LoginPage /> },
  { path: "/m/onboarding", element: <OnboardingGate /> },
  {
    element: <AuthGuard />,
    children: [{
      element: <AppShell />,
      children: [
        { path: "/m", element: <Navigate to="/m/work" replace /> },
        { path: "/m/work", element: <MyWorkList /> },
        { path: "/m/work/:id", element: <MyWorkDetail /> },
        { path: "/m/dashboard", element: <Placeholder title={t("nav.dashboard")} /> },
        { path: "/m/analytics", element: <Placeholder title={t("nav.analytics")} /> },
        { path: "/m/me", element: <MePage /> },
      ],
    }],
  },
  { path: "*", element: <Navigate to="/m/work" replace /> },
]);
```

- [ ] **Step 17.3: `vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __SW_VERSION__: string;
```

- [ ] **Step 17.4: `main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { router } from "./router";
import { logEvent } from "./telemetry";
import "./theme";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);

try {
  registerSW({ immediate: true });
} catch {
  logEvent("sw_register_failed", {});
}

const displayMode = window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser";
logEvent("pwa_boot", { version: __SW_VERSION__, display_mode: displayMode });

if (!localStorage.getItem("vt_pwa_onboarded") && !location.pathname.startsWith("/m/login")) {
  if (!location.pathname.startsWith("/m/onboarding")) {
    history.replaceState(null, "", "/m/onboarding");
  }
}
```

- [ ] **Step 17.5: Build + smoke**

```bash
cd pwa && npm run build && cd ..
bench restart
```

Open `http://<site>/m/` in browser → expect onboarding → login → My Work list.

- [ ] **Step 17.6: Commit**

```bash
git add pwa/src/main.tsx pwa/src/router.tsx pwa/src/AppShell.tsx pwa/src/vite-env.d.ts
git commit -m "feat(pwa): wire router, app shell, SW registration, telemetry boot"
```

---

## Task 18: PWA icons

**Files:**
- Create: `pwa/public/icons/icon-192.png`
- Create: `pwa/public/icons/icon-512.png`
- Create: `pwa/public/icons/maskable-512.png`

- [ ] **Step 18.1: Generate placeholder icons**

Solid `#0b0b10` background, white "V" centered. Sizes 192/512/512 maskable.

With ImageMagick:

```bash
mkdir -p pwa/public/icons
for sz in 192 512; do
  magick -size ${sz}x${sz} xc:'#0b0b10' \
    -fill white -gravity center -pointsize $((sz/2)) -annotate 0 'V' \
    pwa/public/icons/icon-${sz}.png
done
magick -size 512x512 xc:'#0b0b10' \
  -fill white -gravity center -pointsize 200 -annotate 0 'V' \
  pwa/public/icons/maskable-512.png
```

- [ ] **Step 18.2: Verify**

```bash
cd pwa && npm run build && cd ..
ls vernon_tasks/www/m/icons/
```

Expected: 3 PNGs present.

- [ ] **Step 18.3: Commit**

```bash
git add pwa/public/icons
git commit -m "feat(pwa): placeholder app icons (192, 512, 512 maskable)"
```

---

## Task 19: Build helper + README

**Files:**
- Create: `pwa/build-pwa.sh`
- Modify: `README.md`

- [ ] **Step 19.1: Helper script**

`pwa/build-pwa.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npm run build
echo "PWA built into ../vernon_tasks/www/m/"
```

```bash
chmod +x pwa/build-pwa.sh
```

- [ ] **Step 19.2: Update README**

Append:

```markdown
## Mobile PWA

Vernon mobile PWA lives in `pwa/` (React + Vite). Served at `/m/`.

Build:

    ./pwa/build-pwa.sh
    bench restart

Source: `pwa/src/`. Build output: `vernon_tasks/www/m/` (git-ignored).
```

- [ ] **Step 19.3: Commit**

```bash
git add pwa/build-pwa.sh README.md
git commit -m "chore(pwa): build helper + README"
```

---

## Task 20: Playwright smoke

**Files:**
- Create: `pwa/playwright.config.ts`
- Create: `pwa/e2e/smoke.spec.ts`
- Modify: `pwa/package.json`

- [ ] **Step 20.1: Install Playwright**

```bash
cd pwa
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 20.2: Add script**

In `pwa/package.json` `scripts`:

```json
"e2e": "playwright test"
```

- [ ] **Step 20.3: `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PWA_BASE_URL ?? "http://localhost:8000",
    headless: true,
  },
});
```

- [ ] **Step 20.4: `e2e/smoke.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

const USER = process.env.PWA_TEST_USER ?? "Administrator";
const PASS = process.env.PWA_TEST_PASS ?? "admin";

test("login → My Work renders", async ({ page }) => {
  await page.goto("/m/work");
  await page.fill('input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: /selamat/i })).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 20.5: Run smoke**

```bash
PWA_BASE_URL=http://<site> PWA_TEST_USER=<user> PWA_TEST_PASS=<pwd> npm run e2e
```

Expected: 1 PASS.

- [ ] **Step 20.6: Commit**

```bash
git add pwa/playwright.config.ts pwa/e2e pwa/package.json pwa/package-lock.json
git commit -m "test(pwa): playwright smoke (login → My Work)"
```

---

## Task 21: Pilot rollout checklist

**Files:**
- Create: `docs/rollout/pwa-pilot.md`

- [ ] **Step 21.1: Checklist doc**

```markdown
# Vernon PWA P0.5 Pilot

## Pre-launch

- [ ] `./pwa/build-pwa.sh` succeeds locally
- [ ] `bench build && bench restart` on staging
- [ ] `/m/` returns SPA on staging
- [ ] iOS Safari: A2HS works, icon + standalone display
- [ ] Android Chrome: manual install works
- [ ] Airplane mode: cached list still renders, banner shows
- [ ] Manually expire `sid` cookie: ReloginModal opens
- [ ] Vernon Telemetry Event records `pwa_boot` rows

## Pilot week

- [ ] 1 team (5–10 users) invited
- [ ] Daily check on `Vernon Telemetry Event` for `error_boundary` and
      `login_failure` rates
- [ ] Collect qualitative feedback (Slack thread / form)

## Go/no-go gate

- [ ] `error_boundary` < 1% of `page_view`
- [ ] `login_failure` post-success < 5%
- [ ] Install rate ≥ 30% of pilot users
- [ ] No P0 bugs open

## Company-wide

- [ ] Desk banner linking to `/m/`
- [ ] Email announcement
```

- [ ] **Step 21.2: Commit**

```bash
git add docs/rollout/pwa-pilot.md
git commit -m "docs(rollout): PWA P0.5 pilot checklist"
```

---

## Task 22: Final integration + PR

- [ ] **Step 22.1: All unit tests**

```bash
cd pwa && npm test && cd ..
```

Expected: all green.

- [ ] **Step 22.2: Backend tests**

```bash
bench --site <site> run-tests --app vernon_tasks
```

Expected: green.

- [ ] **Step 22.3: Lint**

```bash
cd pwa && npm run lint && cd ..
```

- [ ] **Step 22.4: Build + manual walkthrough**

```bash
./pwa/build-pwa.sh
bench restart
```

Open `/m/`. Walk: onboarding → login → list → detail → /me → logout → re-login.

- [ ] **Step 22.5: Push + PR**

```bash
git push -u origin feat/pwa-foundation
gh pr create --title "feat(pwa): foundation + My Work read-only (P0.5)" --body "$(cat <<'EOF'
## Summary
- Standalone PWA at /m/ (React + Vite + workbox)
- Frappe session cookie auth + re-login modal
- Read-only offline cache (IDB + StaleWhileRevalidate)
- My Work list + detail screens
- Telemetry DocType + endpoint + daily purge
- i18n id-ID, design tokens light+dark, safe-area aware

## Phasing
P0.5 (this PR) — foundation + read-only My Work
P1 — mutations + install prompt
P2 — Dashboard + Analytics
P3 — Leader views

## Test plan
- [ ] `cd pwa && npm test` green
- [ ] `bench run-tests --app vernon_tasks` green
- [ ] iOS Safari A2HS works
- [ ] Android Chrome manual install
- [ ] Airplane mode: cached list renders + banner
- [ ] Cookie expiry: ReloginModal preserves route
- [ ] Telemetry rows visible in Desk

Spec: docs/superpowers/specs/2026-05-11-vernon-pwa-foundation-design.md

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 22.6: Track pilot**

After PR merged + deployed, run pilot per `docs/rollout/pwa-pilot.md`.

---

## Self-Review

Spec coverage:

| Spec section | Task(s) |
|---|---|
| Goals (PWA at /m/, session cookie, read-only offline, My Work, foundation) | 4, 5, 9, 10, 13, 14, 15 |
| Repository layout | 5, 11–17 |
| Frappe integration (route, build) | 4, 19 |
| Auth flow (probe, login, mid-session 401, CSRF, boot) | 8, 9, 11.12, 17 |
| Data flow (react-query → IDB + sync-time, SWR) | 5, 10, 13 |
| Telemetry events | 1, 2, 12, 17 |
| i18n (id-ID, formal Anda, DD MMM YYYY) | 7 |
| Bottom nav | 11.11, 17 |
| My Work list (sections, greeting, stale, P2R, empty) | 14 |
| My Work detail (read-only, action placeholder) | 15 |
| Onboarding (3-slide, localStorage flag) | 16.1 |
| Re-login modal (preserve route) | 11.12, 17.1 |
| Offline UX (banner, StaleBadge, amber >1h) | 11.8, 11.9 |
| Error handling (network, 401, 5xx, boundary, SW fail) | 8, 11.5, 17 |
| Backend additions (my_work, telemetry, boot, DocType, route, purge) | 1, 2, 3, 4, 9.1 |
| Testing (Vitest unit + component, backend pytest, Playwright) | 1.1, 2.1, 3.1, 7.1, 8.1, 9.2, 10.1, 11.1, 13.1, 14.1, 20 |
| Rollout (pilot 1 team, telemetry gates) | 21 |

All sections mapped.

Placeholder scan: no TBD / "implement later" / generic "handle errors".

Type consistency: `MyWork`, `TaskCard`, `TaskDetail`, `Session`, `TelemetryEvent` consistent across tasks.

Plan ready.
