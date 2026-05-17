# Mobile ↔ Desktop Responsive Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a two-tier top navigation (Nav1 + Nav2) for desktop (≥768px) while keeping the existing BottomNav unchanged on mobile.

**Architecture:** A `useMediaQuery(768)` hook drives conditional rendering in `AppShell` — desktop gets `TopNav`, mobile gets `BottomNav`. Tab state in `Analytics` and `Leader` migrates from `useState` to `useSearchParams` so Nav2 can control active tab. Page layouts gain CSS-media-query-based grid columns for desktop.

**Tech Stack:** React 18, TypeScript, react-router-dom v6 (`useSearchParams`), Vitest + Testing Library, inline styles (project convention)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `pwa/src/hooks/useMediaQuery.ts` | Returns `boolean` for `min-width` match |
| Create | `pwa/src/components/TopNav.tsx` | Desktop Nav1 + Nav2 two-tier bar |
| Modify | `pwa/src/AppShell.tsx` | Swap BottomNav↔TopNav based on breakpoint |
| Modify | `pwa/src/components/SafeArea.tsx` | Desktop: padding-top from nav height vars |
| Modify | `pwa/src/theme/tokens.css` | Add `--top-nav1-h`, `--top-nav2-h`; desktop media overrides |
| Modify | `pwa/src/pages/Analytics.tsx` | Tab state → `useSearchParams` |
| Modify | `pwa/src/pages/Leader.tsx` | Tab state → `useSearchParams` |
| Modify | `pwa/src/pages/Dashboard.tsx` | Desktop 2-column grid layout |
| Modify | `pwa/src/pages/MyWork/List.tsx` | Desktop master-detail layout |

---

## Task 1: `useMediaQuery` hook

**Files:**
- Create: `pwa/src/hooks/useMediaQuery.ts`
- Test: `pwa/src/hooks/useMediaQuery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// pwa/src/hooks/useMediaQuery.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  let listeners: Map<string, EventListener>;

  beforeAll(() => {
    listeners = new Map();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(min-width: 768px)" ? false : false,
        media: query,
        addEventListener: (_: string, cb: EventListener) => {
          listeners.set(query, cb);
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("returns false when media does not match", () => {
    const { result } = renderHook(() => useMediaQuery(768));
    expect(result.current).toBe(false);
  });

  it("updates when media changes", () => {
    const { result } = renderHook(() => useMediaQuery(768));
    act(() => {
      const cb = listeners.get("(min-width: 768px)");
      cb?.({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd pwa && npx vitest run src/hooks/useMediaQuery.test.ts
```
Expected: FAIL — "Cannot find module './useMediaQuery'"

- [ ] **Step 3: Implement hook**

```ts
// pwa/src/hooks/useMediaQuery.ts
import { useEffect, useState } from "react";

export function useMediaQuery(minWidth: number): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd pwa && npx vitest run src/hooks/useMediaQuery.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add pwa/src/hooks/useMediaQuery.ts pwa/src/hooks/useMediaQuery.test.ts
git commit -m "feat(hooks): add useMediaQuery for responsive layout detection"
```

---

## Task 2: CSS tokens for desktop nav

**Files:**
- Modify: `pwa/src/theme/tokens.css`

- [ ] **Step 1: Add desktop nav tokens and media override**

In `pwa/src/theme/tokens.css`, inside the existing `:root { ... }` block, add these three lines directly after `--bottom-nav-h: 64px;`:

```css
  --top-nav1-h: 0px;
  --top-nav2-h: 0px;
  --top-nav-total-h: 0px;
```

Then after the closing `}` of `:root`, append a new media query block:

```css
@media (min-width: 768px) {
  :root {
    --top-nav1-h: 52px;
    --top-nav2-h: 40px;
    --top-nav-total-h: calc(var(--top-nav1-h) + var(--top-nav2-h));
    --bottom-nav-h: 0px;
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add pwa/src/theme/tokens.css
git commit -m "feat(tokens): add desktop nav height CSS variables"
```

---

## Task 3: `SafeArea` desktop padding

**Files:**
- Modify: `pwa/src/components/SafeArea.tsx`

- [ ] **Step 1: Update SafeArea to use desktop nav height**

Replace the entire file content:

```tsx
// pwa/src/components/SafeArea.tsx
import { ReactNode } from "react";

export function SafeArea({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        paddingTop: "calc(var(--safe-top) + var(--top-nav-total-h))",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add pwa/src/components/SafeArea.tsx
git commit -m "feat(layout): SafeArea accounts for desktop TopNav height"
```

---

## Task 4: `TopNav` component (Nav1 + Nav2)

**Files:**
- Create: `pwa/src/components/TopNav.tsx`
- Test: `pwa/src/components/TopNav.test.tsx`

The component renders Nav1 (primary links) and Nav2 (submenu, slide-in when active item has submenus). It reads `useIsLeader` to conditionally show Leader tab. Nav2 tab clicks use `setSearchParams`.

- [ ] **Step 1: Write failing test**

```tsx
// pwa/src/components/TopNav.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { TopNav } from "./TopNav";

vi.mock("../hooks/useIsLeader", () => ({ useIsLeader: () => false }));
vi.mock("../hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ data: 0 }),
}));

function Wrapper({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<TopNav />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TopNav", () => {
  it("renders Nav1 items", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("hides Leader for non-leaders", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.queryByText("Leader")).not.toBeInTheDocument();
  });

  it("shows Analytics Nav2 when analytics is active", () => {
    render(<Wrapper path="/m/analytics" />);
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Velocity")).toBeInTheDocument();
    expect(screen.getByText("Streak")).toBeInTheDocument();
  });

  it("hides Nav2 when active page has no submenus", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.queryByText("Leaderboard")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd pwa && npx vitest run src/components/TopNav.test.tsx
```
Expected: FAIL — "Cannot find module './TopNav'"

- [ ] **Step 3: Implement TopNav**

```tsx
// pwa/src/components/TopNav.tsx
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { useIsLeader } from "../hooks/useIsLeader";
import { useUnreadCount } from "../hooks/useUnreadCount";

const NAV1_BASE = [
  { to: "/m/dashboard", label: "Dashboard", key: "dashboard" },
  { to: "/m/leader",    label: "Leader",    key: "leader",  leaderOnly: true },
  { to: "/m/work",      label: "Work",      key: "work" },
  { to: "/m/analytics", label: "Analytics", key: "analytics" },
  { to: "/m/me",        label: "Me",        key: "me" },
] as const;

const NAV2: Record<string, { label: string; tab: string }[]> = {
  analytics: [
    { label: "Leaderboard", tab: "leaderboard" },
    { label: "Velocity",    tab: "velocity" },
    { label: "Streak",      tab: "streak" },
  ],
  leader: [
    { label: "Review Queue", tab: "review" },
    { label: "Sprint",       tab: "sprint" },
    { label: "Executive",    tab: "exec" },
  ],
  me: [
    { label: "Profile",        tab: "profile" },
    { label: "Notifications",  tab: "notifications" },
    { label: "Push Settings",  tab: "push" },
  ],
};

const ME_TAB_ROUTES: Record<string, string> = {
  profile:       "/m/me",
  notifications: "/m/me/notifications",
  push:          "/m/me/notifications/settings",
};

const S = {
  nav1: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    height: "var(--top-nav1-h)",
    background: "#08010f",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    zIndex: 50,
    gap: 0,
  },
  logo: {
    padding: "0 24px",
    fontSize: 16,
    fontWeight: 800,
    color: "#a855f7",
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap" as const,
    userSelect: "none" as const,
  },
  nav1Items: {
    display: "flex",
    alignItems: "center",
    height: "100%",
    gap: 2,
  },
  nav2: {
    position: "fixed" as const,
    top: "var(--top-nav1-h)",
    left: 0,
    right: 0,
    height: "var(--top-nav2-h)",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    zIndex: 49,
    padding: "0 16px",
    gap: 4,
  },
} as const;

function nav1ItemStyle(isActive: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    height: "100%",
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 600,
    color: isActive ? "#a855f7" : "rgba(255,255,255,0.45)",
    textDecoration: "none",
    position: "relative" as const,
    borderBottom: isActive ? "2px solid #a855f7" : "2px solid transparent",
    transition: "color 0.15s, border-color 0.15s",
  };
}

function nav2ItemStyle(isActive: boolean) {
  return {
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    background: isActive ? "rgba(168,85,247,0.18)" : "transparent",
    color: isActive ? "#a855f7" : "rgba(255,255,255,0.45)",
    transition: "background 0.15s, color 0.15s",
  };
}

export function TopNav() {
  const isLeader = useIsLeader();
  const unread = useUnreadCount();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();

  const activeKey = NAV1_BASE.find((n) => {
    if (n.key === "me") return loc.pathname.startsWith("/m/me");
    return loc.pathname.startsWith(n.to);
  })?.key ?? "dashboard";

  const submenus = NAV2[activeKey] ?? [];
  const activeTab = params.get("tab") ?? submenus[0]?.tab ?? "";

  const nav1Items = NAV1_BASE.filter((n) =>
    "leaderOnly" in n && n.leaderOnly ? isLeader === true : true
  );

  function handleNav2Click(item: { label: string; tab: string }) {
    if (activeKey === "me") {
      const route = ME_TAB_ROUTES[item.tab];
      if (route) window.location.href = route;
    } else {
      setParams({ tab: item.tab }, { replace: true });
    }
  }

  return (
    <>
      <nav style={S.nav1}>
        <span style={S.logo}>◆ Vernon</span>
        <div style={S.nav1Items}>
          {nav1Items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              style={({ isActive }) => nav1ItemStyle(
                item.key === "me"
                  ? loc.pathname.startsWith("/m/me")
                  : isActive
              )}
            >
              {item.label}
              {item.key === "me" && unread.data && unread.data > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#a855f7",
                  }}
                />
              ) : null}
            </NavLink>
          ))}
        </div>
      </nav>

      {submenus.length > 0 && (
        <div style={S.nav2}>
          {submenus.map((item) => (
            <button
              key={item.tab}
              style={nav2ItemStyle(activeTab === item.tab)}
              onClick={() => handleNav2Click(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd pwa && npx vitest run src/components/TopNav.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/TopNav.tsx pwa/src/components/TopNav.test.tsx
git commit -m "feat(nav): add TopNav component with Nav1 + Nav2 for desktop"
```

---

## Task 5: AppShell — wire TopNav vs BottomNav

**Files:**
- Modify: `pwa/src/AppShell.tsx`

- [ ] **Step 1: Update AppShell**

```tsx
// pwa/src/AppShell.tsx
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { TopNav } from "./components/TopNav";
import { OfflineBanner } from "./components/OfflineBanner";
import { SafeArea } from "./components/SafeArea";
import { ReloginModal } from "./components/ReloginModal";
import { ToastProvider } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { onAuthChallenge } from "./api/client";
import { logEvent } from "./telemetry";

export function AppShell() {
  const [reloginOpen, setReloginOpen] = useState(false);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);
  const loc = useLocation();
  const isDesktop = useMediaQuery(768);

  useEffect(() => {
    onAuthChallenge(
      () =>
        new Promise<boolean>((resolve) => {
          setResolver(() => resolve);
          setReloginOpen(true);
        }),
    );
  }, []);

  useEffect(() => {
    logEvent("page_view", { route: loc.pathname });
  }, [loc.pathname]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineBanner />
        {isDesktop ? <TopNav /> : null}
        <SafeArea>
          <Outlet />
        </SafeArea>
        {isDesktop ? null : <BottomNav />}
        <ReloginModal
          open={reloginOpen}
          onResolve={(ok) => {
            setReloginOpen(false);
            resolver?.(ok);
            setResolver(null);
          }}
        />
      </ToastProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add pwa/src/AppShell.tsx
git commit -m "feat(shell): render TopNav on desktop, BottomNav on mobile"
```

---

## Task 6: Analytics — tab state via URL params

**Files:**
- Modify: `pwa/src/pages/Analytics.tsx`

Current: `const [tab, setTab] = useState<TabKey>("leaderboard")`  
Target: `useSearchParams` with fallback to `"leaderboard"`

- [ ] **Step 1: Replace tab state in `AnalyticsPage`**

In `pwa/src/pages/Analytics.tsx`, replace the import list top — add `useSearchParams`:
```tsx
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
```
Remove `useState` from the import (it's still used inside tab components, so keep it if any tab component uses it — check: `LeaderboardTab`, `VelocityTab`, `StreakTab` each use `useState` internally, so keep `useState` in the import for those).

Full import line after edit:
```tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Replace tab state in `AnalyticsPage` function**

Find and replace in `AnalyticsPage`:
```tsx
// REMOVE:
const [tab, setTab] = useState<TabKey>("leaderboard");

// ADD:
const [params, setParams] = useSearchParams();
const tab = (params.get("tab") as TabKey) ?? "leaderboard";
function setTab(k: TabKey) {
  setParams({ tab: k }, { replace: true });
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add pwa/src/pages/Analytics.tsx
git commit -m "feat(analytics): tab state driven by URL search params"
```

---

## Task 7: Leader — tab state via URL params

**Files:**
- Modify: `pwa/src/pages/Leader.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

In `pwa/src/pages/Leader.tsx`, add to imports:
```tsx
import { useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Replace tab state in `LeaderPage`**

Find and replace in `LeaderPage`:
```tsx
// REMOVE:
const [tab, setTab] = useState<TabKey>("review");

// ADD:
const [params, setParams] = useSearchParams();
const tab = (params.get("tab") as TabKey) ?? "review";
function setTab(k: TabKey) {
  setParams({ tab: k }, { replace: true });
}
```

Remove unused `useState` import only if `LeaderPage` was the only consumer — `LeaderReviewTab` uses `useState` internally, so keep `useState` in the import.

- [ ] **Step 3: Verify TypeScript**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add pwa/src/pages/Leader.tsx
git commit -m "feat(leader): tab state driven by URL search params"
```

---

## Task 8: Dashboard — desktop 2-column layout

**Files:**
- Modify: `pwa/src/pages/Dashboard.tsx`

The dashboard hero + stat cards go left; Kanban columns go right. On mobile (< 900px via CSS) both sections stack. Use a CSS class-free approach with inline style + a wrapping grid div.

- [ ] **Step 1: Wrap dashboard content in responsive grid**

In `pwa/src/pages/Dashboard.tsx`, find the `return` JSX in `DashboardPage`. Wrap the content below the hero section in a two-column grid:

Find this section (after the closing `</div>` of the hero `<div style={{ background: ... padding: "20px 20px 0" }}`):
```tsx
{/* ── Content ── */}
<div style={{ padding: "16px 20px 32px" }}>
```

Replace with:
```tsx
{/* ── Content — responsive grid ── */}
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 24,
  padding: "16px 20px 32px",
  alignItems: "start",
}}>
```

This uses `auto-fit` + `minmax` so on narrow screens it becomes single-column automatically, and on wide screens it expands to fill available columns.

- [ ] **Step 2: Verify TypeScript**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add pwa/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): responsive 2-column grid layout for desktop"
```

---

## Task 9: MyWork — desktop master-detail layout

**Files:**
- Modify: `pwa/src/pages/MyWork/List.tsx`

On desktop, render task list at 380px fixed-width on the left, and a detail panel on the right. Detail panel shows `<MyWorkDetail>` inline when a task `id` is in state, or an empty state. On mobile, the detail link navigates (existing behavior unchanged).

- [ ] **Step 1: Add `useMediaQuery` import and selected task state**

At the top of `pwa/src/pages/MyWork/List.tsx`, add:
```tsx
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { MyWorkDetail } from "./Detail";
```

Inside `MyWorkList` function body, add:
```tsx
const isDesktop = useMediaQuery(768);
const [selectedId, setSelectedId] = useState<string | null>(null);
```

- [ ] **Step 2: Wrap list + detail in master-detail container**

Find the outermost `return` div in `MyWorkList`. Wrap it:

```tsx
return (
  <div style={{
    display: "flex",
    height: "100%",
    minHeight: "100vh",
  }}>
    {/* List panel */}
    <div style={{
      width: isDesktop ? 380 : "100%",
      minWidth: isDesktop ? 380 : undefined,
      flexShrink: 0,
      borderRight: isDesktop ? "1px solid var(--vt-border)" : undefined,
      overflowY: "auto",
    }}>
      {/* existing list JSX goes here unchanged */}
      <PullToRefresh onRefresh={...}>
        ...
      </PullToRefresh>
    </div>

    {/* Detail panel — desktop only */}
    {isDesktop && (
      <div style={{ flex: 1, overflowY: "auto", background: "var(--vt-bg)" }}>
        {selectedId ? (
          <MyWorkDetail desktopId={selectedId} />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--vt-text-muted)",
            fontSize: 14,
          }}>
            Pilih task untuk melihat detail
          </div>
        )}
      </div>
    )}
  </div>
);
```

- [ ] **Step 3: Make task cards selectable on desktop**

Find the task card click/link handler. When `isDesktop`, call `setSelectedId(task.name)` instead of navigating. When not desktop, keep existing `<Link to={...}>` behavior.

In the task card JSX, wrap the card with:
```tsx
{isDesktop ? (
  <div
    onClick={() => setSelectedId(card.name)}
    style={{ cursor: "pointer" }}
  >
    {/* card content */}
  </div>
) : (
  <Link to={`/m/work/${card.name}`}>
    {/* card content */}
  </Link>
)}
```

- [ ] **Step 4: Add `desktopId` prop to `MyWorkDetail`**

Open `pwa/src/pages/MyWork/Detail.tsx`. The component currently reads `:id` from `useParams`. Add an optional override:

```tsx
// At top of Detail.tsx, update props:
export function MyWorkDetail({ desktopId }: { desktopId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = desktopId ?? params.id ?? "";
  // rest unchanged — replace all usages of `params.id` with `id`
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add pwa/src/pages/MyWork/List.tsx pwa/src/pages/MyWork/Detail.tsx
git commit -m "feat(work): master-detail layout on desktop"
```

---

## Task 10: Full build + lint verification

- [ ] **Step 1: Run full test suite**

```bash
cd pwa && npx vitest run
```
Expected: all tests pass, 0 failures

- [ ] **Step 2: Run TypeScript check**

```bash
cd pwa && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Build production bundle**

```bash
cd pwa && npm run build
```
Expected: build completes without errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(pwa): mobile/desktop responsive nav and page layouts"
```

---

## QA Checklist (post-implementation manual verification)

Run against a dev server (`cd pwa && npm run dev`) at `http://localhost:5173/m/dashboard`:

**Desktop (browser width ≥ 768px):**
- [ ] TopNav visible with: `◆ Vernon` logo, Dashboard, Work, Analytics, Me
- [ ] Leader tab hidden when logged in as non-leader
- [ ] Nav2 appears below Nav1 when Analytics or Leader or Me is active
- [ ] Nav2 hidden when Dashboard or Work is active
- [ ] Active Nav1 item has purple underline indicator
- [ ] Active Nav2 item has purple pill background
- [ ] Clicking Analytics Nav2 items changes tab content without page reload
- [ ] Refreshing page with `?tab=velocity` keeps Velocity tab active
- [ ] Dashboard shows 2-column layout (stat cards + Kanban)
- [ ] Work shows list panel left + "Pilih task" empty state right
- [ ] Clicking a task in Work list shows detail in right panel
- [ ] BottomNav NOT visible

**Mobile (browser width < 768px or DevTools mobile emulation):**
- [ ] BottomNav visible at bottom
- [ ] TopNav NOT visible
- [ ] Analytics uses internal Tabs component (not Nav2)
- [ ] Leader uses internal Tabs component
- [ ] Work task click navigates to detail page (not inline panel)
- [ ] Dashboard shows single-column layout
- [ ] PullToRefresh still works on all pages

**Resize test:**
- [ ] Resizing browser from 800px → 600px switches TopNav → BottomNav without layout errors
- [ ] Resizing from 600px → 800px switches BottomNav → TopNav without layout errors
