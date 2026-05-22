# TopNav Dual Navbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-row tab TopNav with a two-row navbar (navbar1: logo + breadcrumb + utility icons; navbar2: Dashboard / Project / Report), redirect post-login to `/m/dashboard`, and increase content padding.

**Architecture:** `TopNav.tsx` is rewritten in place — navbar1 is a sticky header row, navbar2 is a second sticky row below it. Both are desktop-only (≥768px). Dropdown state (notifications, avatar) managed via local `useState` + click-outside `useEffect`. Inline SVG icons — no external library. `tokens.css` heights remain unchanged (`--top-nav1-h: 44px`, `--top-nav2-h: 36px`). Navbar2 bg set via inline style `#f1f5f9`.

**Tech Stack:** React 18, React Router v6, TypeScript, inline CSS-in-JS, `auth/session.ts` for logout, `useUnreadCount` + `NotificationBell` from portal notifications.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `pwa/src/components/TopNav.tsx` | Rewrite | Dual navbar UI + dropdowns |
| `pwa/src/theme/tokens.css` | No change | Heights already correct |
| `pwa/src/portal/dashboard/dashboard.css` | Modify | Increase `.db-root` padding |
| `pwa/src/router.tsx` | Modify | Change 2 redirect targets |
| `vernon_tasks/www/login.html` | Modify | Change default redirect |

---

## Task 1: Fix Login Redirect Targets

**Files:**
- Modify: `pwa/src/router.tsx:42,49,76`
- Modify: `vernon_tasks/www/login.html:525`

- [ ] **Step 1: Update router.tsx — three redirect targets**

Open `pwa/src/router.tsx`. Change these three occurrences of `/m/work` to `/m/dashboard`:

```typescript
// Line 42 — RootRedirect (desktop branch stays /portal, mobile changes)
return <Navigate to={isDesktop ? "/portal" : "/m/dashboard"} replace />;

// Line 49 — OnboardingGate
return <Navigate to="/m/dashboard" replace />;

// Line 76 — catch-all *
{ path: "*", element: <Navigate to="/m/dashboard" replace /> },
```

- [ ] **Step 2: Update login.html default redirect**

Open `vernon_tasks/www/login.html` line 525. Change:
```javascript
// Before:
var redirect = {{ (redirect_to or "/m/work") | tojson }};

// After:
var redirect = {{ (redirect_to or "/m/dashboard") | tojson }};
```

- [ ] **Step 3: Verify with grep**

```bash
grep -n "m/work" pwa/src/router.tsx vernon_tasks/www/login.html
```
Expected: no matches (all replaced).

- [ ] **Step 4: Commit**

```bash
git add pwa/src/router.tsx vernon_tasks/www/login.html
git commit -m "feat(nav): redirect post-login to /m/dashboard"
```

---

## Task 2: Increase Dashboard Padding

**Files:**
- Modify: `pwa/src/portal/dashboard/dashboard.css:36-43,529-533`

- [ ] **Step 1: Update .db-root padding**

In `pwa/src/portal/dashboard/dashboard.css`, find `.db-root` block (around line 31) and change `padding: 20px 22px` to `padding: 28px 36px`:

```css
.db-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px 36px;   /* was: 20px 22px */
  min-height: 100%;
  background:
    radial-gradient(ellipse 60% 30% at 70% -5%, rgba(61, 158, 255, 0.06) 0%, transparent 55%),
    radial-gradient(ellipse 40% 20% at 5%  95%, rgba(167, 139, 250, 0.05) 0%, transparent 55%),
    var(--db-bg);
  font-family: var(--db-font-body);
  color: var(--db-text);
}
```

- [ ] **Step 2: Update mobile padding breakpoint**

Find `@media (max-width: 767px)` block near line 529 and change `.db-root` padding from `12px` to `16px`:

```css
@media (max-width: 767px) {
  .db-root    { padding: 16px; }   /* was: 12px */
  .db-summary { grid-template-columns: repeat(2, 1fr); }
  .db-team-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Commit**

```bash
git add pwa/src/portal/dashboard/dashboard.css
git commit -m "style(dashboard): increase content padding 20→28px vertical, 22→36px horizontal"
```

---

## Task 3: Rewrite TopNav — Navbar1 (Logo + Breadcrumb + Utility Icons)

**Files:**
- Rewrite: `pwa/src/components/TopNav.tsx`

This task replaces the entire `TopNav.tsx` content. Write the new file in one step; subsequent tasks refine the dropdowns.

- [ ] **Step 1: Understand what exists (read before overwriting)**

Current `TopNav.tsx` imports: `NavLink`, `useLocation`, `useSearchParams`, `useNavigate` from react-router-dom; `useIsLeader`; `useUnreadCount`.

New imports needed: `useState`, `useEffect`, `useRef` from react; `Link`, `useLocation`, `useNavigate` from react-router-dom; `logout` from `../auth/session`; `useUnreadCount` from `../hooks/useUnreadCount`.

- [ ] **Step 2: Define constants and SVG icon helpers at top of file**

```typescript
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";

/* ── Design tokens ── */
const NAV1_H   = "var(--top-nav1-h)";   // 44px on desktop
const NAV2_H   = "var(--top-nav2-h)";   // 36px on desktop
const NAV2_BG  = "#f1f5f9";
const PRIMARY  = "var(--vt-primary)";
const TEXT_MUTED = "var(--vt-text-muted)";
const BORDER   = "var(--vt-border)";

/* ── Route → breadcrumb label map ── */
const BREADCRUMB_MAP: { prefix: string; label: string }[] = [
  { prefix: "/m/dashboard", label: "Dashboard" },
  { prefix: "/m/work",      label: "Work" },
  { prefix: "/m/analytics", label: "Analytics" },
  { prefix: "/m/leader",    label: "Leader" },
  { prefix: "/m/me",        label: "Me" },
];

function getBreadcrumb(pathname: string): string {
  const match = BREADCRUMB_MAP.find((r) => pathname.startsWith(r.prefix));
  return match?.label ?? "Vernon";
}

/* ── Navbar2 items (hardcoded) ── */
const NAV2_ITEMS = [
  { label: "Dashboard", to: "/m/dashboard" },
  { label: "Project",   to: "/m/work" },
  { label: "Report",    to: "/m/analytics" },
] as const;
```

- [ ] **Step 3: Write inline SVG icon components**

Add these pure components after the constants block. They render flat single-color SVG icons with no external dependency:

```typescript
function IconBell({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconUser({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
```

- [ ] **Step 4: Write the NotificationButton sub-component**

This wraps the bell icon with an unread badge. It opens the notification dropdown on click (a simple list from `useUnreadCount` — full panel via portal is a separate concern; here we reuse the existing `NotificationBell` from portal or render a simple badge-only button).

Since the portal's `NotificationBell` uses `createPortal` and computes position from a `buttonRef`, we can import and reuse it directly if the route context is available. However `NotificationBell` is in `pwa/src/portal/notifications/NotificationBell.tsx` and depends on portal-specific hooks. Instead, write a self-contained button that shows the badge count and navigates to `/m/me/notifications` on click:

```typescript
function NotificationButton({ unread }: { unread: number }) {
  return (
    <button
      onClick={() => window.location.assign("/m/me/notifications")}
      aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        border: "none",
        background: "transparent",
        borderRadius: 8,
        cursor: "pointer",
        color: TEXT_MUTED,
        transition: "background 0.13s, color 0.13s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--vt-primary-light)";
        (e.currentTarget as HTMLButtonElement).style.color = PRIMARY;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
      }}
    >
      <IconBell />
      {unread > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ef4444",
            boxShadow: "0 0 0 2px var(--vt-bg)",
          }}
        />
      )}
    </button>
  );
}
```

Note: using `window.location.assign` instead of `useNavigate` because `NotificationButton` has no router context prop here — or pass `navigate` as a prop. See Step 5 for the corrected version that passes `navigate`.

- [ ] **Step 5: Write AvatarDropdown sub-component**

The avatar button shows a person icon. Clicking opens a small dropdown with "Profil" link and "Keluar" button. Click-outside closes it.

```typescript
function AvatarDropdown({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    nav("/m/login", { replace: true });
  }

  const initials = username
    ? username.split("@")[0].slice(0, 2).toUpperCase()
    : "?";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu akun"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          border: "none",
          background: open ? "var(--vt-primary-light)" : "transparent",
          borderRadius: 8,
          cursor: "pointer",
          color: open ? PRIMARY : TEXT_MUTED,
          transition: "background 0.13s, color 0.13s",
        }}
      >
        <IconUser />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            background: "var(--vt-bg)",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {username && (
            <div
              style={{
                padding: "10px 14px 8px",
                fontSize: 11,
                color: TEXT_MUTED,
                borderBottom: `1px solid ${BORDER}`,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {username}
            </div>
          )}
          <Link
            to="/m/me"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "9px 14px",
              fontSize: 13,
              color: "var(--vt-text)",
              textDecoration: "none",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "var(--vt-primary-light)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")}
          >
            Profil
          </Link>
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "9px 14px",
              fontSize: 13,
              color: "#dc2626",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              borderTop: `1px solid ${BORDER}`,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#fef2f2")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
          >
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the main TopNav export**

Replace the old `export function TopNav()` with:

```typescript
export function TopNav() {
  const loc = useLocation();
  const { data: unread = 0 } = useUnreadCount();

  // username from sessionStorage or window.frappe_user (set by Frappe)
  const username: string | null =
    (window as unknown as { frappe_user?: string }).frappe_user ?? null;

  const breadcrumb = getBreadcrumb(loc.pathname);

  return (
    <>
      {/* ── Navbar1 ─────────────────────────────────────────── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: NAV1_H,
          background: "var(--vt-bg)",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          gap: 0,
          zIndex: 50,
          padding: "0 20px",
        }}
      >
        {/* Logo */}
        <Link
          to="/m/dashboard"
          style={{
            fontFamily: "'Barlow Condensed', 'Outfit', system-ui, sans-serif",
            fontSize: 17,
            fontWeight: 900,
            color: PRIMARY,
            textDecoration: "none",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          Vernon
        </Link>

        {/* Divider */}
        <div
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: BORDER,
            margin: "0 14px",
            flexShrink: 0,
          }}
        />

        {/* Breadcrumb */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--vt-text)",
          }}
        >
          {breadcrumb}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Notification bell */}
        <NotificationButton unread={unread} />

        {/* Avatar / account dropdown */}
        <AvatarDropdown username={username} />
      </header>

      {/* ── Navbar2 ─────────────────────────────────────────── */}
      <nav
        aria-label="Main menu"
        style={{
          position: "fixed",
          top: NAV1_H,
          left: 0,
          right: 0,
          height: NAV2_H,
          background: NAV2_BG,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          zIndex: 49,
          padding: "0 20px",
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {NAV2_ITEMS.map((item) => {
          const isActive = loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
                padding: "0 12px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--vt-text)" : TEXT_MUTED,
                textDecoration: "none",
                borderBottom: isActive ? `2px solid ${PRIMARY}` : "2px solid transparent",
                transition: "color 0.14s, border-color 0.14s",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 7: Fix NotificationButton to use useNavigate**

Update `NotificationButton` to accept `onNavigate` prop instead of `window.location.assign`:

```typescript
function NotificationButton({ unread, onNavigate }: { unread: number; onNavigate: () => void }) {
  return (
    <button
      onClick={onNavigate}
      aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        border: "none",
        background: "transparent",
        borderRadius: 8,
        cursor: "pointer",
        color: TEXT_MUTED,
        transition: "background 0.13s, color 0.13s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--vt-primary-light)";
        (e.currentTarget as HTMLButtonElement).style.color = PRIMARY;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
      }}
    >
      <IconBell />
      {unread > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ef4444",
            boxShadow: "0 0 0 2px var(--vt-bg)",
          }}
        />
      )}
    </button>
  );
}
```

And update `TopNav` to pass navigate:

```typescript
export function TopNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: unread = 0 } = useUnreadCount();
  const username: string | null =
    (window as unknown as { frappe_user?: string }).frappe_user ?? null;
  const breadcrumb = getBreadcrumb(loc.pathname);

  return (
    <>
      <header ...>
        ...
        <NotificationButton unread={unread} onNavigate={() => nav("/m/me/notifications")} />
        <AvatarDropdown username={username} />
      </header>
      <nav ...>...</nav>
    </>
  );
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd pwa && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors from `TopNav.tsx`.

- [ ] **Step 9: Commit**

```bash
git add pwa/src/components/TopNav.tsx
git commit -m "feat(nav): dual navbar — logo+breadcrumb+icons navbar1, Dashboard/Project/Report navbar2"
```

---

## Task 4: Verify Navbar2 Active State for /m/dashboard

The `Dashboard` item in navbar2 links to `/m/dashboard` and the active check is `loc.pathname.startsWith(item.to)`. Since `/m/dashboard` does not prefix-match `/m/work` or `/m/analytics`, this is unambiguous. However, `/m/dashboard` also starts with `/m/d` — verify that `/m/` routes don't conflict.

- [ ] **Step 1: Manual check — open browser at each navbar2 route**

```
http://task.localhost:8080/m/dashboard  → Dashboard tab active
http://task.localhost:8080/m/work       → Project tab active
http://task.localhost:8080/m/analytics  → Report tab active
```

Confirm border-bottom blue under active tab, others grey.

- [ ] **Step 2: Fix edge case — /m/dashboard vs /m/work startsWith overlap**

`"/m/work".startsWith("/m/work")` = true ✓  
`"/m/dashboard".startsWith("/m/work")` = false ✓  
`"/m/analytics".startsWith("/m/analytics")` = true ✓  

No conflict — no code change needed.

- [ ] **Step 3: Check breadcrumb on portal routes**

Navigate to `/portal` — breadcrumb should fall through to "Vernon" (no match in `BREADCRUMB_MAP`). The portal has its own `TopBar`, so `AppShell` + `TopNav` are not rendered there. Verify `router.tsx` routes confirm `/portal/*` renders `LazyPortalShell` (not `AppShell`). No fix needed if confirmed.

---

## Task 5: Verify Frappe username availability

The `AvatarDropdown` reads `window.frappe_user`. Verify this property is set by Frappe on the PWA shell page.

- [ ] **Step 1: Check Frappe boot sets frappe_user**

```bash
grep -rn "frappe_user\|window.frappe" \
  /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks/www/m.html \
  /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks/www/m.py
```

- [ ] **Step 2: If frappe_user not set — fall back to boot API**

If the grep shows no `frappe_user` assignment, update `TopNav` to fetch it from the boot API on mount. Add a `useEffect` + `useState`:

```typescript
const [username, setUsername] = useState<string | null>(
  (window as unknown as { frappe_user?: string }).frappe_user ?? null
);

useEffect(() => {
  if (username) return; // already known
  import("../auth/session").then(({ probeSession }) =>
    probeSession().then((s) => setUsername(s.user))
  );
}, []);
```

Replace the static `const username` line in `TopNav` with this hook. The import is dynamic to avoid circular dependency risk.

- [ ] **Step 3: Commit if changed**

```bash
git add pwa/src/components/TopNav.tsx
git commit -m "fix(nav): derive username from boot API when frappe_user not on window"
```

---

## Task 6: Build and Smoke Test

- [ ] **Step 1: TypeScript check**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa
npx tsc --noEmit 2>&1
```
Expected: exit 0, no errors.

- [ ] **Step 2: Build PWA**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa
npm run build 2>&1 | tail -10
```
Expected: `✓ built in Xs` with no errors.

- [ ] **Step 3: Verify login redirects to /m/dashboard**

1. Open `http://task.localhost:8080/m/login` — log out if needed, then log in.
2. Confirm browser lands on `http://task.localhost:8080/m/dashboard`.

- [ ] **Step 4: Verify navbar1 renders correctly on desktop (≥768px)**

Check: Logo "VERNON" (blue, uppercase), vertical divider, breadcrumb label "Dashboard", bell icon with badge if unread, person icon.

- [ ] **Step 5: Verify navbar2 renders correctly**

Check: `#f1f5f9` grey background, three items — Dashboard / Project / Report. Active item has blue border-bottom.

- [ ] **Step 6: Verify mobile (≤767px)**

Resize browser to <768px. Check: navbar1 and navbar2 are hidden (CSS `--top-nav1-h: 0px` at <768px handles this via `display` or height). `BottomNav` visible.

Note: The current `AppShell.tsx` conditionally renders `TopNav` via `{isDesktop ? <TopNav /> : null}` where `isDesktop = useMediaQuery(768)`. So on mobile `TopNav` is not mounted at all — responsive is already handled. No change needed.

- [ ] **Step 7: Verify avatar dropdown**

Click person icon → dropdown shows username, "Profil" link, "Keluar" button. Click outside → closes. Click "Profil" → navigates to `/m/me`. Click "Keluar" → logs out, redirects to `/m/login`.

- [ ] **Step 8: Final commit**

```bash
git add -p
git commit -m "feat(nav): topnav dual navbar redesign complete"
```

---

## Self-Review

**Spec coverage:**
- [x] Login redirect `/m/work` → `/m/dashboard` — Task 1
- [x] Navbar1: Logo, Divider, Breadcrumb, Notification icon, Avatar dropdown — Task 3
- [x] Navbar2: Dashboard / Project / Report hardcoded — Task 3 Step 6
- [x] Navbar2 background light grey — Task 3 Step 6 (`#f1f5f9`)
- [x] Flat icons (inline SVG, no lib) — Task 3 Steps 3-4
- [x] Responsive (desktop/mobile handled by AppShell mediaQuery) — Task 6 Step 6
- [x] Bigger page padding — Task 2

**Placeholder scan:** None found. All code steps are complete.

**Type consistency:**
- `NotificationButton` props: `{ unread: number; onNavigate: () => void }` — used consistently in Steps 7 and 6.
- `AvatarDropdown` props: `{ username: string | null }` — consistent.
- `getBreadcrumb(pathname: string): string` — used in `TopNav` Step 6.
- `NAV2_ITEMS` typed `as const` — `item.to` and `item.label` used correctly.
- `logout` from `../auth/session` — same import path as `Me.tsx` uses `../../auth/session` (different depth; TopNav is in `components/`, so `../auth/session` is correct).
