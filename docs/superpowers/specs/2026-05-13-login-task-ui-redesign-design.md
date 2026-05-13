# UI Redesign: Login Page & Task Interface

**Date:** 2026-05-13  
**Scope:** Visual redesign only — no logic, API, or routing changes  
**Files affected:** `tokens.css`, `login.tsx`, `MyWork/List.tsx`

---

## 1. Design Decisions

| Screen | Layout | Style |
|--------|--------|-------|
| Login | Full-screen immersive (Option C) | Dark gradient + glassmorphism form |
| Task list | Card list + sticky purple header (Option A) | Gradient header, colored-border cards |

**Primary color:** `#9561ab` (purple)  
**Aesthetic:** Warm & Friendly — dark for login, light/purple-tinted for task list

---

## 2. Design Tokens (`pwa/src/theme/tokens.css`)

Add/replace in `:root`:

```css
--vt-primary:          #9561ab;   /* was #1e6bff */
--vt-primary-dark:     #2d1540;
--vt-primary-mid:      #4a2870;
--vt-primary-light:    #f5f0f8;
--vt-primary-contrast: #ffffff;
```

Dark mode override:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --vt-primary: #c084fc;  /* lighter purple for dark bg */
  }
}
```

All existing usages of `var(--vt-primary)` in other pages pick up purple automatically.

---

## 3. Login Page (`pwa/src/auth/login.tsx`)

### Layout

Full-screen `div` (height: 100svh), flex column, centered. No max-width wrapper on outer container.

### Background

```
background: linear-gradient(160deg, #2d1540 0%, #4a2870 40%, #9561ab 100%)
```

Three decorative circles (`position: absolute`, low opacity) for depth:
- Top-right: 180×180px, `rgba(149,97,171, 0.25)`
- Bottom-left: 140×140px, `rgba(149,97,171, 0.15)`
- Mid-left: 80×80px, `rgba(255,255,255, 0.05)`

### Logo + Title

Centered above form:
- Icon box: 56×56px, `border-radius: 16px`, `rgba(255,255,255,0.15)` bg, `1px solid rgba(255,255,255,0.25)` border
- App name: "Vernon Tasks", white, `font-weight: 700`, `font-size: 20px`
- Subtitle: "Selamat datang kembali", `rgba(255,255,255,0.55)`, `font-size: 13px`

### Form Card (glassmorphism)

```css
background: rgba(255,255,255,0.1);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid rgba(255,255,255,0.2);
border-radius: 20px;
padding: 28px;
width: 320px;
max-width: calc(100vw - 48px);
box-shadow: 0 8px 32px rgba(0,0,0,0.3);
```

**Input fields:**
- Label: `rgba(255,255,255,0.7)`, 12px, uppercase, `letter-spacing: 0.5px`
- Input: `background: rgba(255,255,255,0.12)`, `border: 1px solid rgba(255,255,255,0.2)`, `border-radius: 10px`, `color: white`
- Focus state: border brightens to `rgba(255,255,255,0.5)`

**Error state:**
- `background: rgba(239,68,68,0.2)`, `border: 1px solid rgba(239,68,68,0.4)`
- Text: `rgba(255,200,200,0.9)`, 13px
- Rendered only when `err !== null`

**Submit button:**
```css
background: #9561ab;
color: white;
border-radius: 12px;
padding: 13px;
font-size: 15px;
font-weight: 600;
box-shadow: 0 4px 16px rgba(149,97,171,0.5);
width: 100%;
```
Disabled state: `opacity: 0.6`, cursor not-allowed.

### Footer note

Below form card: "Hanya untuk karyawan Vernon Corp" — `rgba(255,255,255,0.35)`, 12px.

### No changes to

- `login()` call in `onSubmit`
- Session handling / redirect logic
- `localStorage.setItem("vt_last_user", ...)`
- i18n keys: keep existing `t("login.*")` calls unchanged

---

## 4. MyWork List (`pwa/src/pages/MyWork/List.tsx`)

### Sticky Header

Replace existing `<header>` with gradient block:

```css
background: linear-gradient(135deg, #2d1540, #9561ab);
padding: var(--vt-space-4) var(--vt-space-4) var(--vt-space-3);
position: sticky;
top: 0;
z-index: 10;
```

Contents (top to bottom):
1. Date line: `fmtDate(new Date())`, `rgba(255,255,255,0.65)`, 12px
2. Greeting: `greeting()`, white, 18px, bold
3. Filter chips (horizontal scroll, no scrollbar):
   - "Semua" (always shown, active = white bg, inactive = translucent)
   - "Terlambat {n}" shown only if `overdue.length > 0`, accent red dot
   - "Hari ini {n}" shown only if `today.length > 0`
   - Chips are display-only labels for now — clicking "Semua" resets view, others scroll to section

### Search Bar

Moves to below the header gradient, inside a white strip:

```css
background: white;
padding: var(--vt-space-2) var(--vt-space-4);
border-bottom: 1px solid var(--vt-primary-light);
position: sticky;
top: var(--vt-header-h, 96px);  /* header height set via inline style on mount */
z-index: 9;
```

### Task Card (`TaskCardView`)

Replace inline card style:

```css
/* container */
background: white;
border-radius: var(--vt-radius);
border-left: 3px solid [accent];
box-shadow: 0 1px 6px rgba(149,97,171,0.08);
padding: var(--vt-space-3) var(--vt-space-4);
display: flex;
align-items: center;
gap: 12px;
```

Accent color per section:
- `overdue` section → `var(--vt-danger)` (#d4351c)
- `today` section → `var(--vt-primary)` (#9561ab)
- `upcoming` section → `var(--vt-border)` (#e3e6ec)

### Section Labels

Style the `<h3>` inside `Section`:

```css
font-size: 11px;
font-weight: 700;
letter-spacing: 0.8px;
text-transform: uppercase;
margin: var(--vt-space-4) 0 var(--vt-space-2);
/* color per section: overdue=#d4351c, today=#9561ab, upcoming=var(--vt-text-muted) */
```

### Page Background

```css
background: var(--vt-primary-light);  /* #f5f0f8 */
```

Set on the outer container div (or via `body` override scoped to this page).

### No changes to

- All query/mutation logic (`useQuery`, `useUndoableMutation`, etc.)
- `FilterSheet`, `LogProgressModal`, `SwipeRow`, `TaskActions` — these components keep current behavior
- `PullToRefresh` wrapper
- `InstallPrompt`
- `StaleBadge`
- Routing

---

## 5. Out of Scope

- Detail page (`MyWork/Detail.tsx`) — not redesigned in this spec
- Dashboard, Analytics, Leader, Me pages — unchanged
- New features (create task, kanban, etc.)
- Backend / API changes

---

## 6. Test Criteria

- [ ] Login page renders correctly on mobile (375px) and desktop (1280px)
- [ ] Login error state shows correctly (red translucent box inside glassmorphism card)
- [ ] Login busy state disables button + shows loading text
- [ ] `vt_last_user` pre-fills username field
- [ ] Task list header is sticky on scroll
- [ ] Filter chips show correct counts from API data
- [ ] Overdue cards have red left border, today = purple, upcoming = grey
- [ ] Section labels have correct color per section
- [ ] Dark mode: primary switches to `#c084fc`, backgrounds invert correctly
- [ ] No regression in SwipeRow, LogProgressModal, FilterSheet behavior
