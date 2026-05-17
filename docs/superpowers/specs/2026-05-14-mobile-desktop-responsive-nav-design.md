# Spec: Mobile ↔ Desktop Responsive Navigation & Layout

**Date**: 2026-05-14  
**Status**: Approved  
**Project**: Vernon Tasks PWA (Frappe Web)

---

## 1. Goal

Deliver distinctly different experiences for mobile and desktop while sharing one codebase:

- **Mobile** (< 768px): existing BottomNav, mobile-first layouts — unchanged
- **Desktop** (≥ 768px): two-tier TopNav (Nav1 + Nav2), full-width responsive page layouts, tab state driven by URL params

---

## 2. Navigation Structure

### Nav1 — Primary (always visible on desktop)

| Order | Item      | Route          | Visible         |
|-------|-----------|----------------|-----------------|
| 1     | Dashboard | `/m/dashboard` | All users       |
| 2     | Leader    | `/m/leader`    | Leaders only    |
| 3     | Work      | `/m/work`      | All users       |
| 4     | Analytics | `/m/analytics` | All users       |
| 5     | Me        | `/m/me`        | All users       |

### Nav2 — Submenu (appears below Nav1 when active item has submenus)

| Nav1 Active | Nav2 Items                          | Tab Param Values                    |
|-------------|-------------------------------------|-------------------------------------|
| Dashboard   | *(none)*                            | —                                   |
| Leader      | Review Queue · Sprint · Executive   | `review` · `sprint` · `exec`        |
| Work        | *(none)*                            | —                                   |
| Analytics   | Leaderboard · Velocity · Streak     | `leaderboard` · `velocity` · `streak` |
| Me          | Profile · Notifications · Push Settings | `profile` · `notifications` · `push` |

---

## 3. Visual Design

### Nav1 (52px height)

- Full width, `position: fixed`, top: 0
- Background: `#08010f` + bottom border `rgba(255,255,255,0.08)`
- Left: `◆ Vernon` logo in `var(--vt-primary)`
- Nav items: 14px, 600 weight
  - Default: `var(--vt-text-muted)`
  - Active: `var(--vt-primary)` + 2px bottom indicator bar
  - Hover: `rgba(255,255,255,0.04)` background
- Leader item hidden for non-leader accounts

### Nav2 (40px height)

- Appears directly below Nav1 when active item has submenus
- Background: `rgba(255,255,255,0.03)` + bottom border `rgba(255,255,255,0.06)`
- Smooth slide-down/up animation on show/hide
- Items: 13px, active = `var(--vt-primary)` pill background
- CSS variable `--top-nav2-visible: 0 | 1` drives height and padding

### Content area

- `padding-top`: `52px` (Nav1 only) or `92px` (Nav1 + Nav2)
- Driven by CSS vars: `--top-nav1-h: 52px`, `--top-nav2-h: 40px`
- Full width, no max-width constraint
- Responsive grid/flex — columns collapse at narrower desktop widths

---

## 4. Page Layouts (Desktop)

All layouts are **full width** and **responsive** — columns collapse as viewport narrows.

### Dashboard
- 2-column CSS Grid: stat cards (left) + Kanban board (right)
- Stat cards stack to single column below ~900px

### Work
- Master-detail: task list (380px) + detail panel (remainder)
- Detail panel shows selected task or empty state "Select a task"
- Below ~900px: list only, detail navigates to full page (existing mobile behavior)

### Analytics
- Nav2 replaces internal `<Tabs>` component on desktop
- Charts expand full width, larger render
- Period chips remain above content

### Leader
- Nav2: Review · Sprint · Executive
- Review: table layout (vs card stack on mobile)
- Sprint: burndown + forecast charts side-by-side
- Executive: health score + OKR table side-by-side

### Me
- Centered card layout, full width with generous padding
- Nav2: Profile · Notifications · Push Settings navigate to existing routes

---

## 5. Architecture

### New files
- `pwa/src/components/TopNav.tsx` — Nav1 + Nav2 combined component
- `pwa/src/hooks/useMediaQuery.ts` — `useMediaQuery(minWidth: number): boolean`

### Modified files
| File | Change |
|------|--------|
| `AppShell.tsx` | Render `TopNav` or `BottomNav` based on `useMediaQuery(768)` |
| `SafeArea.tsx` | Desktop: `padding-top` from CSS vars instead of safe-area-inset |
| `tokens.css` | Add `--top-nav1-h`, `--top-nav2-h`; `@media (min-width: 768px)` overrides |
| `Analytics.tsx` | Read/write `?tab=xxx` via `useSearchParams` |
| `Leader.tsx` | Read/write `?tab=xxx` via `useSearchParams` |
| `Dashboard.tsx` | Desktop 2-column grid layout |
| `pages/MyWork/List.tsx` | Desktop master-detail layout |

---

## 6. Tab State Migration

**Analytics** and **Leader** currently use internal `useState` for tab switching.

Desktop change:
- `useSearchParams` replaces `useState` for tab tracking
- Mobile: `<Tabs>` component reads from URL param too (backward-compatible)
- Default: if no param, fallback to first submenu item

```ts
// Pattern
const [params, setParams] = useSearchParams();
const tab = params.get("tab") ?? DEFAULT_TAB;
const setTab = (t: string) => setParams({ tab: t }, { replace: true });
```

---

## 7. Edge Cases

| Case | Resolution |
|------|------------|
| Resize mobile→desktop | CSS handles layout — no JS state reset needed |
| Non-leader visits `/m/leader` directly | Existing redirect guard handles it |
| Nav2 missing tab param | Default to first item in submenu |
| Me submenu on desktop | Navigate to existing routes (`/m/me/notifications`, etc.) |
| `--safe-bottom` on desktop | Always 0 — no notch padding needed |

---

## 8. Acceptance Criteria (QA Checklist)

- [ ] BottomNav hidden at ≥ 768px, visible at < 768px
- [ ] TopNav visible at ≥ 768px, hidden at < 768px
- [ ] Nav1 order: Dashboard → Leader → Work → Analytics → Me
- [ ] Leader item absent when user is not a leader
- [ ] Nav2 slides in/out smoothly when switching between items with/without submenus
- [ ] Analytics tab state syncs to URL param, survives page refresh
- [ ] Leader tab state syncs to URL param, survives page refresh
- [ ] Dashboard 2-column on ≥ 900px, single column below
- [ ] Work master-detail on ≥ 900px, list-only below
- [ ] All pages full width — no fixed max-width cap
- [ ] No layout shift on resize between breakpoints
- [ ] Dark purple theme consistent mobile ↔ desktop
- [ ] No regressions on mobile (existing Tabs, BottomNav, PullToRefresh)
