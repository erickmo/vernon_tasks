# Workspace Navigation Improvement

**Date:** 2026-05-09  
**Status:** Approved

## Goal

Make navigation seamless for all three roles (VT Member, VT Leader, VT Manager) by:
1. Fixing missing shortcuts in workspace JSONs
2. Adding a shared in-page nav bar to all custom pages

---

## Part 1 — Workspace Shortcut Fixes

### My Projects (`workspace/my_projects.json`) — VT Leader
**Problem:** Leader Dashboard page has no shortcut in the leader workspace.  
**Fix:** Add shortcut `Leader Dashboard` → `leader-dashboard` (Page, color Orange, icon `bar-chart`).

### Overview (`workspace/overview.json`) — VT Manager  
**Problem:** Leader Review page is not accessible from the manager workspace.  
**Fix:** Add shortcut `Leader Review` → `leader-review` (Page, color Blue, icon `check-circle`).

### My Tasks (`workspace/my_tasks.json`) — VT Member  
No changes needed — shortcuts already complete.

---

## Part 2 — Shared In-Page Nav Bar

### New file: `public/js/page_nav.js`

Global helper function injected into every Frappe page via `app_include_js`.

```js
function vt_render_page_nav(page, links) { ... }
```

**`links` array shape:**
```js
[{ label: "My Tasks", route: "workspace/My Tasks", icon: "home" }]
```

Renders a `<div class="vt-page-nav">` prepended to `page.main` with Frappe-styled `btn btn-xs btn-default` buttons. Clicking calls `frappe.set_route(link.route)`.

**Style:** small bar, muted background (`var(--subtle-fg)`), 8px padding, flex row, gap 8px. Does not overlap page content — sits above the page container div.

### hooks.py

Add to `app_include_js`:
```python
app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]
```

### Nav links per page

| Page | Left links | Right links |
|---|---|---|
| `my_work` | My Tasks (workspace) | My Dashboard |
| `my_dashboard` | My Work | My Tasks (workspace) |
| `leader_review` | My Projects (workspace) | Leader Dashboard |
| `leader_dashboard` | Leader Review | My Projects (workspace) |

Each page calls `vt_render_page_nav(page, [...])` immediately after `frappe.ui.make_app_page(...)`.

---

## Files Changed

| File | Change |
|---|---|
| `public/js/page_nav.js` | NEW — shared nav helper |
| `hooks.py` | Add `app_include_js` |
| `workspace/my_projects.json` | Add Leader Dashboard shortcut |
| `workspace/overview.json` | Add Leader Review shortcut |
| `task/page/my_work/my_work.js` | Add `vt_render_page_nav` call |
| `task/page/my_dashboard/my_dashboard.js` | Add `vt_render_page_nav` call |
| `task/page/leader_review/leader_review.js` | Add `vt_render_page_nav` call |
| `task/page/leader_dashboard/leader_dashboard.js` | Add `vt_render_page_nav` call |

---

## Out of Scope

- No changes to Vernon Tasks (admin) workspace
- No new pages or doctypes
- No role-based nav filtering (all links shown regardless of role)
