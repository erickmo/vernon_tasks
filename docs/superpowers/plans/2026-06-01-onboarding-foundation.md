# Onboarding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vernon Tasks usable from zero — new users get a role, a seeded navbar, a working first-click path, action-oriented empty states, and a self-completing onboarding checklist on the landing page, with optional demo data.

**Architecture:** Backend changes are Frappe framework-event hooks (`on_session_creation`, `after_install`, `after_migrate`), a setup module for demo data, and a whitelisted onboarding API whose per-user step completion is **derived from data** (the native `Onboarding Step.is_complete` flag is global, so we do not use it for per-user state). Native `Module Onboarding` records mirror the catalog for the Workspace surface. Frontend changes are vanilla jQuery render edits to existing desk Page scripts plus one shared `window.vt_*` helper.

**Tech Stack:** Frappe v15 (Python + `frappe.tests.utils.FrappeTestCase`/unittest), desk Page JS (jQuery, `frappe.ui.Dialog`, `frappe.set_route`), fixtures.

---

## Conventions for this plan

- **Run tests (bench is in Docker):**
  `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module <module.path>`
- **After adding/altering any `@frappe.whitelist()` method or hook:** restart the backend so gunicorn reimports:
  `docker restart frappe-backend-1`
- **After editing any doctype JSON or `hooks.py`:** run migrate:
  `docker exec frappe-backend-1 bench --site task.localhost migrate`
- **Doc creation in tests** uses `frappe.get_doc({...}).insert(ignore_permissions=True)`; set user via `frappe.set_user(email)` and reset in `tearDown` with `frappe.set_user("Administrator")`.
- **Commit** after each task with a conventional message in Bahasa Indonesia.

## File structure (created / modified)

| File | Responsibility |
|------|----------------|
| `vernon_tasks/setup/__init__.py` | new package marker |
| `vernon_tasks/setup/roles.py` | grant `VT Member` on session creation |
| `vernon_tasks/setup/test_roles.py` | role-grant tests |
| `vernon_tasks/setup/demo_data.py` | load/clear demo data, ref tracking |
| `vernon_tasks/setup/test_demo_data.py` | demo load/clear tests |
| `vernon_tasks/setup/onboarding_seed.py` | idempotent seed of native Module Onboarding records (workspace parity) |
| `vernon_tasks/setup_website.py` | add `ensure_navbar_seeded()` (seed-if-empty) |
| `vernon_tasks/tests/test_navbar_seed.py` | navbar seed-if-empty tests |
| `vernon_tasks/task/api/onboarding.py` | whitelisted onboarding API + derived completion |
| `vernon_tasks/task/api/test_onboarding.py` | onboarding API tests |
| `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` | add `demo_data_refs` field |
| `vernon_tasks/hooks.py` | register hooks, `app_include_js`, fixtures |
| `vernon_tasks/public/js/vt_empty.js` | shared `window.vt_render_empty_state` helper |
| `vernon_tasks/task/page/vt_home/vt_home.js` | routing fix, primary action, quick-create, empty state, onboarding card |
| `vernon_tasks/task/page/vt_projects/vt_projects.js` | empty-state CTA |
| `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json` | onboarding content block |

---

## Task 1: Add `demo_data_refs` field to VT Settings

**Files:**
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` (append to `fields` array, after `navbar_items`)

- [ ] **Step 1: Add the field object**

In `vt_settings.json`, locate the `navbar_items` field object (the last entry in `"fields"`). Add a comma after it and append:

```json
    {
     "fieldname": "demo_data_refs",
     "fieldtype": "Small Text",
     "label": "Demo Data Refs",
     "hidden": 1,
     "read_only": 1,
     "description": "JSON list of {doctype,name} created by load_demo, used for precise teardown. Managed by code."
    }
```

Also ensure `demo_data_refs` is appended to the `"field_order"` array (if the doctype JSON has one — add `"demo_data_refs"` as the last entry).

- [ ] **Step 2: Sync the schema**

Run: `docker exec frappe-backend-1 bench --site task.localhost migrate`
Expected: migrate completes; no error about VT Settings.

- [ ] **Step 3: Verify the field exists**

Run: `docker exec frappe-backend-1 bench --site task.localhost execute "frappe.db.get_value" --kwargs "{'doctype':'VT Settings','filters':'VT Settings','fieldname':'demo_data_refs'}"`
Expected: prints `None` (field exists, empty) — not a missing-field error.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json
git commit -m "feat(settings): tambah field demo_data_refs untuk pelacakan data contoh"
```

---

## Task 2: Auto-grant `VT Member` on session creation

**Files:**
- Create: `vernon_tasks/setup/__init__.py`
- Create: `vernon_tasks/setup/roles.py`
- Create: `vernon_tasks/setup/test_roles.py`
- Modify: `vernon_tasks/hooks.py` (add `on_session_creation`)

- [ ] **Step 1: Create the package marker**

Create `vernon_tasks/setup/__init__.py` (empty file).

- [ ] **Step 2: Write the failing test**

Create `vernon_tasks/setup/test_roles.py`:

```python
# Tests for default-role assignment on session creation.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup.roles import grant_default_role

_VT_ROLES = {"VT Manager", "VT Leader", "VT Member"}


class _FakeLoginManager:
    def __init__(self, user):
        self.user = user


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": email.split("@")[0],
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


class TestGrantDefaultRole(FrappeTestCase):
    def tearDown(self):
        frappe.set_user("Administrator")

    def test_grants_vt_member_to_roleless_user(self):
        user = _ensure_user("roleless_onboard@test.local")
        frappe.get_doc("User", user).remove_roles(*list(_VT_ROLES & set(frappe.get_roles(user))))
        grant_default_role(_FakeLoginManager(user))
        self.assertIn("VT Member", frappe.get_roles(user))

    def test_idempotent_when_already_has_vt_role(self):
        user = _ensure_user("hasleader_onboard@test.local")
        frappe.get_doc("User", user).add_roles("VT Leader")
        grant_default_role(_FakeLoginManager(user))
        roles = frappe.get_roles(user)
        self.assertNotIn("VT Member", roles)  # not granted because already has a VT role

    def test_skips_administrator(self):
        grant_default_role(_FakeLoginManager("Administrator"))
        self.assertNotIn("VT Member", frappe.get_roles("Administrator"))
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.setup.test_roles`
Expected: FAIL — `ModuleNotFoundError`/`ImportError` for `vernon_tasks.setup.roles`.

- [ ] **Step 4: Write the implementation**

Create `vernon_tasks/setup/roles.py`:

```python
"""Grant a sensible default VT role to users who hold none.

Wired to the `on_session_creation` framework event (hooks.py). There is no
VT-owned doctype lifecycle for "a user logged in", so this is a framework-event
concern rather than a controller method.
"""
import frappe

DEFAULT_ROLE = "VT Member"
_VT_ROLES = ("VT Manager", "VT Leader", "VT Member")
_SKIP_USERS = ("Administrator", "Guest")


def grant_default_role(login_manager):
    """On session creation, give `VT Member` to any non-admin user with no VT role.

    Idempotent: does nothing if the user already holds any VT role. Called by
    Frappe with `login_manager` whose `.user` is the authenticated username.
    """
    user = getattr(login_manager, "user", None)
    if not user or user in _SKIP_USERS:
        return
    if set(_VT_ROLES) & set(frappe.get_roles(user)):
        return
    frappe.get_doc("User", user).add_roles(DEFAULT_ROLE)
```

- [ ] **Step 5: Register the hook**

In `vernon_tasks/hooks.py`, after the `extend_bootinfo = ...` line (line ~21), add:

```python
on_session_creation = ["vernon_tasks.setup.roles.grant_default_role"]
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.setup.test_roles`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/setup/__init__.py vernon_tasks/setup/roles.py vernon_tasks/setup/test_roles.py vernon_tasks/hooks.py
git commit -m "feat(onboarding): auto-grant VT Member ke user baru saat login"
```

---

## Task 3: Auto-seed navbar on install/migrate (seed-if-empty)

**Files:**
- Modify: `vernon_tasks/setup_website.py` (add `ensure_navbar_seeded`)
- Create: `vernon_tasks/tests/test_navbar_seed.py`
- Modify: `vernon_tasks/hooks.py` (add `after_install`, `after_migrate`)

- [ ] **Step 1: Write the failing test**

Create `vernon_tasks/tests/test_navbar_seed.py`:

```python
# Tests for idempotent navbar seeding.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup_website import ensure_navbar_seeded, _NAVBAR_ITEMS

_CHILD = "VT Navbar Item"


class TestEnsureNavbarSeeded(FrappeTestCase):
    def tearDown(self):
        frappe.db.rollback()

    def test_seeds_when_empty(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()
        ensure_navbar_seeded()
        count = frappe.db.count(_CHILD, {"parenttype": "VT Settings"})
        self.assertEqual(count, len(_NAVBAR_ITEMS))

    def test_noop_when_rows_exist(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        doc = frappe.get_single("VT Settings")
        doc.append("navbar_items", {"label": "Custom", "route": "/app/x"})
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        ensure_navbar_seeded()
        labels = frappe.db.get_all(_CHILD, filters={"parenttype": "VT Settings"}, pluck="label")
        self.assertEqual(labels, ["Custom"])  # preserved, not overwritten
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.tests.test_navbar_seed`
Expected: FAIL — `ImportError: cannot import name 'ensure_navbar_seeded'`.

- [ ] **Step 3: Write the implementation**

In `vernon_tasks/setup_website.py`, add after `setup_navbar_items()` (after line ~329):

```python
def ensure_navbar_seeded():
    """Seed navbar items only if none exist (preserves admin customization).

    Wired to after_install + after_migrate so a fresh deploy exposes the full
    menu instead of the 2-item DEFAULT_NAVBAR fallback. Safe on every migrate.
    """
    if frappe.db.count("VT Navbar Item", {"parenttype": "VT Settings"}):
        return
    setup_navbar_items()
```

- [ ] **Step 4: Register the hooks**

In `vernon_tasks/hooks.py`, after the `on_session_creation = ...` line, add:

```python
after_install = ["vernon_tasks.setup_website.ensure_navbar_seeded"]
after_migrate = ["vernon_tasks.setup_website.ensure_navbar_seeded"]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.tests.test_navbar_seed`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/setup_website.py vernon_tasks/tests/test_navbar_seed.py vernon_tasks/hooks.py
git commit -m "feat(onboarding): auto-seed navbar saat install/migrate bila kosong"
```

---

## Task 4: Demo data setup module (load + clear)

**Files:**
- Create: `vernon_tasks/setup/demo_data.py`
- Create: `vernon_tasks/setup/test_demo_data.py`

- [ ] **Step 1: Write the failing test**

Create `vernon_tasks/setup/test_demo_data.py`:

```python
# Tests for optional demo data load/clear.
import json
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup.demo_data import load, clear

_USER = "demo_onboard@test.local"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "Demo",
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


class TestDemoData(FrappeTestCase):
    def setUp(self):
        self.user = _ensure_user(_USER)
        clear()  # start clean

    def tearDown(self):
        clear()
        frappe.set_user("Administrator")

    def test_load_creates_refs_and_records(self):
        result = load(self.user)
        refs = json.loads(frappe.db.get_single_value("VT Settings", "demo_data_refs") or "[]")
        self.assertGreaterEqual(len(refs), 5)  # brand + project + sprint + >=1 task + members
        self.assertEqual(result["tasks"], 3)
        self.assertTrue(frappe.db.exists("VT Project", {"project_owner": self.user}))

    def test_clear_removes_everything(self):
        load(self.user)
        clear()
        refs = frappe.db.get_single_value("VT Settings", "demo_data_refs")
        self.assertIn(refs, (None, "", "[]"))
        self.assertFalse(frappe.db.exists("VT Task", {"assigned_to": self.user, "title": "Demo: Siapkan brief"}))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.setup.test_demo_data`
Expected: FAIL — `ImportError` for `vernon_tasks.setup.demo_data`.

- [ ] **Step 3: Write the implementation**

Create `vernon_tasks/setup/demo_data.py`:

```python
"""Optional demo data: one brand, project, sprint, and three tasks.

This is a one-shot setup utility that spans four doctypes (not a single
doctype lifecycle), so it lives here rather than in a controller — same
rationale as setup_website.py. Every created document is recorded in
VT Settings.demo_data_refs so clear() can delete exactly what it made.
"""
import json
import frappe

_REFS_FIELD = "demo_data_refs"
_BRAND_NAME = "Brand Demo"
_DEMO_TASKS = [
    {"title": "Demo: Siapkan brief", "kanban_status": "Backlog", "base_points": 3},
    {"title": "Demo: Desain awal", "kanban_status": "In Progress", "base_points": 5},
    {"title": "Demo: Review internal", "kanban_status": "In Review", "base_points": 2},
]


def _get_refs():
    raw = frappe.db.get_single_value("VT Settings", _REFS_FIELD)
    return json.loads(raw) if raw else []


def _set_refs(refs):
    frappe.db.set_single_value("VT Settings", _REFS_FIELD, json.dumps(refs))


def load(user=None):
    """Create demo brand/project/sprint/tasks owned by `user`. Returns counts.

    Records every created doc in demo_data_refs (creation order) for teardown.
    """
    user = user or frappe.session.user
    refs = _get_refs()
    today = frappe.utils.today()

    if not frappe.db.exists("VT Brand", _BRAND_NAME):
        brand = frappe.get_doc({"doctype": "VT Brand", "brand_name": _BRAND_NAME})
        brand.insert(ignore_permissions=True)
        refs.append({"doctype": "VT Brand", "name": brand.name})
    brand_name = _BRAND_NAME

    project = frappe.get_doc({
        "doctype": "VT Project", "title": "Proyek Demo", "brand": brand_name,
        "project_owner": user, "project_leader": user,
        "start_date": today, "end_date": frappe.utils.add_days(today, 30),
        "team_members": [
            {"user": user, "role": "Leader", "is_also_leader": 1},
            {"user": "Administrator", "role": "Member"},
        ],
    })
    project.insert(ignore_permissions=True)
    refs.append({"doctype": "VT Project", "name": project.name})

    sprint = frappe.get_doc({
        "doctype": "VT Sprint", "sprint_title": "Sprint Demo 1", "project": project.name,
        "start_date": today, "end_date": frappe.utils.add_days(today, 14),
    })
    sprint.insert(ignore_permissions=True)
    refs.append({"doctype": "VT Sprint", "name": sprint.name})

    task_count = 0
    for t in _DEMO_TASKS:
        task = frappe.get_doc({
            "doctype": "VT Task", "title": t["title"], "project": project.name,
            "assigned_to": user, "kanban_status": t["kanban_status"],
            "base_points": t["base_points"], "deadline": frappe.utils.add_days(today, 7),
        })
        task.flags.ignore_links = True
        task.insert(ignore_permissions=True)
        refs.append({"doctype": "VT Task", "name": task.name})
        task_count += 1

    _set_refs(refs)
    frappe.db.commit()
    return {"brand": 1, "project": 1, "sprint": 1, "tasks": task_count}


def clear():
    """Delete exactly the documents recorded in demo_data_refs (reverse order)."""
    refs = _get_refs()
    for ref in reversed(refs):
        if frappe.db.exists(ref["doctype"], ref["name"]):
            frappe.delete_doc(ref["doctype"], ref["name"], force=True, ignore_permissions=True)
    _set_refs([])
    frappe.db.commit()
    return {"removed": len(refs)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.setup.test_demo_data`
Expected: PASS (2 tests).

> **Caution:** `VT Project.validate` runs `validate_team` (hooks.py doc_events). If demo project insert fails on a team rule (e.g. role/leader combination), inspect `project/doctype/vt_project/vt_project.py:validate_team` and adjust the seeded `team_members` to satisfy it (the `is_also_leader` flag + `role` values are the levers). Do not bypass validate.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/setup/demo_data.py vernon_tasks/setup/test_demo_data.py
git commit -m "feat(onboarding): modul data contoh load/clear dengan pelacakan ref"
```

---

## Task 5: Onboarding API with derived per-user completion

**Files:**
- Create: `vernon_tasks/task/api/onboarding.py`
- Create: `vernon_tasks/task/api/test_onboarding.py`

- [ ] **Step 1: Write the failing test**

Create `vernon_tasks/task/api/test_onboarding.py`:

```python
# Tests for onboarding state derivation + dismiss.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.onboarding import get_onboarding_state, dismiss_onboarding

_USER = "onb_state@test.local"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "Onb",
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
        frappe.get_doc("User", email).add_roles("VT Member")
    return email


class TestOnboardingState(FrappeTestCase):
    def setUp(self):
        self.user = _ensure_user(_USER)
        # Clear any leaked per-user dismiss from a prior run (DefaultValue is the store).
        frappe.defaults.clear_default(key="vt_onboarding_dismissed", parent=self.user)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_fresh_user_all_incomplete(self):
        frappe.set_user(self.user)
        state = get_onboarding_state()
        self.assertEqual(state["progress"]["total"], 4)
        keys_done = {s["key"]: s["is_complete"] for s in state["steps"]}
        self.assertFalse(keys_done["buat_proyek"])  # fresh user leads no project
        self.assertTrue(state["show"])

    def test_project_step_completes_with_project(self):
        frappe.set_user("Administrator")
        if not frappe.db.exists("VT Brand", "OnbBrand"):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": "OnbBrand"}).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "VT Project", "title": "Onb Proj", "brand": "OnbBrand",
            "project_owner": self.user, "project_leader": self.user,
            "start_date": "2026-01-01", "end_date": "2026-12-31",
        }).insert(ignore_permissions=True)
        frappe.set_user(self.user)
        state = get_onboarding_state()
        done = {s["key"]: s["is_complete"] for s in state["steps"]}
        self.assertTrue(done["buat_proyek"])

    def test_dismiss_hides_card(self):
        frappe.set_user(self.user)
        dismiss_onboarding()
        self.assertFalse(get_onboarding_state()["show"])
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.task.api.test_onboarding`
Expected: FAIL — `ImportError` for `vernon_tasks.task.api.onboarding`.

- [ ] **Step 3: Write the implementation**

Create `vernon_tasks/task/api/onboarding.py`:

```python
"""Onboarding state for the vt-home checklist card.

Per-user completion is DERIVED from the user's data, because Frappe's native
Onboarding Step.is_complete is a single global flag shared across all users and
therefore wrong for per-contributor onboarding. The native Module Onboarding
records (seeded separately) mirror this catalog for the Workspace surface only.
"""
import frappe
from vernon_tasks.setup import demo_data

_DISMISS_KEY = "vt_onboarding_dismissed"

# Canonical step catalog. `route_kind`/`route_target` tell the client how to act.
_ONBOARDING_STEPS = [
    {"key": "buat_brand", "title": "Buat brand", "route_kind": "page", "route_target": "vt-brands"},
    {"key": "buat_proyek", "title": "Buat proyek pertama", "route_kind": "quick_create_project", "route_target": ""},
    {"key": "tambah_tim", "title": "Tambah anggota tim", "route_kind": "page", "route_target": "vt-team"},
    {"key": "buat_task", "title": "Buat task pertama", "route_kind": "new_doc", "route_target": "VT Task"},
]


def _user_project_names(user):
    """Names of projects the user owns, leads, or is a team member of."""
    owned = frappe.get_all("VT Project", or_filters={"project_owner": user, "project_leader": user}, pluck="name")
    member = frappe.get_all(
        "Project Team Member", filters={"user": user, "parenttype": "VT Project"}, pluck="parent"
    )
    return set(owned) | set(member)


def _is_complete(key, user, project_names):
    """Derive per-user completion for one step key from actual data."""
    if key == "buat_brand":
        return bool(frappe.db.count("VT Brand"))
    if key == "buat_proyek":
        return bool(project_names)
    if key == "tambah_tim":
        return any(
            frappe.db.count("Project Team Member", {"parent": p, "parenttype": "VT Project"}) >= 2
            for p in project_names
        )
    if key == "buat_task":
        return bool(frappe.db.exists("VT Task", {"assigned_to": user}) or frappe.db.exists("VT Task", {"owner": user}))
    return False


@frappe.whitelist()
def get_onboarding_state():
    """Return the onboarding checklist with per-user derived completion."""
    user = frappe.session.user
    project_names = _user_project_names(user)
    steps = [
        {**s, "is_complete": _is_complete(s["key"], user, project_names)}
        for s in _ONBOARDING_STEPS
    ]
    done = sum(1 for s in steps if s["is_complete"])
    dismissed = bool(frappe.defaults.get_user_default(_DISMISS_KEY))
    has_demo = bool(frappe.db.get_single_value("VT Settings", "demo_data_refs"))
    return {
        "steps": steps,
        "progress": {"done": done, "total": len(steps)},
        "dismissed": dismissed,
        "has_demo": has_demo,
        "show": (not dismissed) and (done < len(steps)),
    }


@frappe.whitelist()
def dismiss_onboarding():
    """Persist a per-user dismissal of the onboarding card."""
    frappe.defaults.set_user_default(_DISMISS_KEY, 1)
    return {"ok": 1}


@frappe.whitelist()
def load_demo():
    """Create optional demo data for the current user."""
    return demo_data.load(frappe.session.user)


@frappe.whitelist()
def clear_demo():
    """Remove the demo data created by load_demo."""
    return demo_data.clear()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.task.api.test_onboarding`
Expected: PASS (3 tests).

- [ ] **Step 5: Restart backend (new whitelist methods)**

Run: `docker restart frappe-backend-1`

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/task/api/onboarding.py vernon_tasks/task/api/test_onboarding.py
git commit -m "feat(onboarding): API state checklist dengan completion turunan per-user"
```

---

## Task 6: Native onboarding records + fixtures + workspace block

**Files:**
- Create: `vernon_tasks/setup/onboarding_seed.py`
- Modify: `vernon_tasks/hooks.py` (add to `after_migrate` chain + `fixtures`)
- Modify: `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json` (prepend onboarding block to `content`)

- [ ] **Step 1: Write the seed module**

Create `vernon_tasks/setup/onboarding_seed.py`:

```python
"""Idempotently seed the native Module Onboarding record + steps.

These mirror the canonical catalog in task/api/onboarding.py for the Workspace
surface only (the vt-home card derives its own per-user state). Exported as
fixtures so fresh installs get them. Safe to re-run.
"""
import frappe

_MODULE = "Task"
_ONBOARDING_NAME = "Vernon Tasks Onboarding"
_STEPS = [
    {"name": "VT Buat Brand", "title": "Buat brand", "action": "Go to Page", "path": "/app/vt-brands"},
    {"name": "VT Buat Proyek", "title": "Buat proyek pertama", "action": "Create Entry", "reference_document": "VT Project"},
    {"name": "VT Tambah Tim", "title": "Tambah anggota tim", "action": "Go to Page", "path": "/app/vt-team"},
    {"name": "VT Buat Task", "title": "Buat task pertama", "action": "Create Entry", "reference_document": "VT Task"},
]


def ensure_onboarding_seeded():
    """Create the Module Onboarding + Onboarding Step records if absent."""
    if frappe.db.exists("Module Onboarding", _ONBOARDING_NAME):
        return
    for s in _STEPS:
        if frappe.db.exists("Onboarding Step", s["name"]):
            continue
        doc = frappe.get_doc({"doctype": "Onboarding Step", **s})
        doc.flags.name_set = True
        doc.insert(ignore_permissions=True)
    frappe.get_doc({
        "doctype": "Module Onboarding",
        "name": _ONBOARDING_NAME,
        "title": "Mulai dengan Vernon Tasks",
        "subtitle": "Empat langkah untuk menyiapkan ruang kerja Anda",
        "module": _MODULE,
        "success_message": "Ruang kerja Anda siap!",
        "documentation_url": "/app/vt-home",
        "steps": [{"step": s["name"]} for s in _STEPS],
    }).insert(ignore_permissions=True)
    frappe.db.commit()
```

- [ ] **Step 2: Add to the after_migrate chain**

In `vernon_tasks/hooks.py`, change the `after_migrate` line from Task 3 to include both:

```python
after_migrate = [
    "vernon_tasks.setup_website.ensure_navbar_seeded",
    "vernon_tasks.setup.onboarding_seed.ensure_onboarding_seeded",
]
```

- [ ] **Step 3: Run the seed + verify**

Run: `docker exec frappe-backend-1 bench --site task.localhost execute vernon_tasks.setup.onboarding_seed.ensure_onboarding_seeded`
Then: `docker exec frappe-backend-1 bench --site task.localhost execute "frappe.db.exists" --kwargs "{'dt':'Module Onboarding','dn':'Vernon Tasks Onboarding'}"`
Expected: prints the name (record exists).

- [ ] **Step 4: Add fixtures**

In `vernon_tasks/hooks.py` `fixtures` list, add these three entries:

```python
    {"dt": "Onboarding Step", "filters": [["name", "in", ["VT Buat Brand", "VT Buat Proyek", "VT Tambah Tim", "VT Buat Task"]]]},
    {"dt": "Module Onboarding", "filters": [["name", "=", "Vernon Tasks Onboarding"]]},
    {"dt": "Onboarding Step Map", "filters": [["parent", "=", "Vernon Tasks Onboarding"]]},
```

- [ ] **Step 5: Add the onboarding block to the workspace**

In `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json`, the `content` value is an escaped JSON string starting with `[{\"type\":\"header\"...`. Insert this block as the FIRST element of that array (right after the opening `[`):

```
{\"type\":\"onboarding\",\"data\":{\"onboarding_name\":\"Vernon Tasks Onboarding\",\"col\":12}},
```

So `content` begins: `"[{\"type\":\"onboarding\",\"data\":{\"onboarding_name\":\"Vernon Tasks Onboarding\",\"col\":12}},{\"type\":\"header\",...`

- [ ] **Step 6: Export fixtures + migrate to validate**

Run: `docker exec frappe-backend-1 bench --site task.localhost export-fixtures --app vernon_tasks`
Then: `docker exec frappe-backend-1 bench --site task.localhost migrate`
Expected: fixtures land in `vernon_tasks/fixtures/` (module_onboarding.json, onboarding_step.json, onboarding_step_map.json); migrate succeeds.

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/setup/onboarding_seed.py vernon_tasks/hooks.py vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json vernon_tasks/fixtures/
git commit -m "feat(onboarding): seed Module Onboarding native + blok workspace + fixtures"
```

---

## Task 7: Fix the broken landing→detail route

**Files:**
- Modify: `vernon_tasks/task/page/vt_home/vt_home.js:126` and `:141`

- [ ] **Step 1: Apply the routing fix**

At `vt_home.js:126`, change:
```javascript
        card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
```
to:
```javascript
        card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project-detail", p.id));
```

At `vt_home.js:141`, change:
```javascript
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
```
to:
```javascript
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project-detail", p.id));
```

- [ ] **Step 2: Rebuild assets**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`

- [ ] **Step 3: Manual verify**

Open `/app/vt-home`, click a project card under "Proyek Saya". Expected: opens the styled `vt-project-detail` board (hero + tabs), NOT a raw VT Project form.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/vt_home/vt_home.js
git commit -m "fix(beranda): kartu proyek route ke vt-project-detail bukan form mentah"
```

---

## Task 8: Shared empty-state helper

**Files:**
- Create: `vernon_tasks/public/js/vt_empty.js`
- Modify: `vernon_tasks/hooks.py` (`app_include_js`)

- [ ] **Step 1: Create the helper**

Create `vernon_tasks/public/js/vt_empty.js` (follows the `window.vt_*` + inline-style pattern of page_nav.js):

```javascript
/**
 * vt_render_empty_state — build an action-oriented dashed-card empty state.
 *
 * @param {Object} o
 *   @param {string} o.title        - bold heading
 *   @param {string} o.message      - one-line explanation
 *   @param {string} [o.cta_label]  - primary button text
 *   @param {Function} [o.on_cta]   - primary click handler
 *   @param {string} [o.secondary_label]
 *   @param {Function} [o.on_secondary]
 * @returns {jQuery} a node to append into a page.
 */
window.vt_render_empty_state = function (o) {
    const box = $('<div class="vt-empty-state"></div>').css({
        textAlign: "center", padding: "32px 20px", borderRadius: "10px",
        background: "#f8fafc", border: "1px dashed var(--vh-border, #e2e8f0)",
        margin: "8px 0",
    });
    $('<div></div>').css({ fontWeight: 600, fontSize: "15px", marginBottom: "4px" })
        .text(o.title || "").appendTo(box);
    $('<div></div>').css({ color: "#64748b", fontSize: "13px", marginBottom: "16px" })
        .text(o.message || "").appendTo(box);
    const actions = $('<div></div>').css({ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" });
    if (o.cta_label) {
        $(`<button class="btn btn-primary btn-sm"></button>`).text(o.cta_label)
            .on("click", o.on_cta || function () {}).appendTo(actions);
    }
    if (o.secondary_label) {
        $(`<button class="btn btn-default btn-sm"></button>`).text(o.secondary_label)
            .on("click", o.on_secondary || function () {}).appendTo(actions);
    }
    box.append(actions);
    return box;
};
```

- [ ] **Step 2: Register the asset**

In `vernon_tasks/hooks.py`, add to `app_include_js` (after `page_nav.js`):

```python
    "/assets/vernon_tasks/js/vt_empty.js",
```

- [ ] **Step 3: Rebuild assets**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`

- [ ] **Step 4: Manual verify**

In the desk browser console run: `vt_render_empty_state({title:"x",message:"y",cta_label:"z"})`. Expected: returns a jQuery object (no `undefined`/error).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/public/js/vt_empty.js vernon_tasks/hooks.py
git commit -m "feat(ui): helper empty-state bersama vt_render_empty_state"
```

---

## Task 9: vt-projects empty-state CTA

**Files:**
- Modify: `vernon_tasks/task/page/vt_projects/vt_projects.js:32-35`

- [ ] **Step 1: Replace the bare empty string with the helper**

At `vt_projects.js`, replace the empty-state branch:
```javascript
    if (!led.length && !member.length) {
        sec.append('<div class="vh-empty">Belum ada proyek.</div>');
        return;
    }
```
with:
```javascript
    if (!led.length && !member.length) {
        sec.append(vt_render_empty_state({
            title: "Belum ada proyek",
            message: "Mulai dengan membuat proyek pertama Anda.",
            cta_label: "Buat Proyek pertama Anda",
            on_cta: () => frappe.new_doc(PROJECT_DOCTYPE),
        }));
        c.append(sec);
        return;
    }
```

Note: confirm the container variable name (`c` / `container`) and `PROJECT_DOCTYPE` constant at the top of the file; if the section is appended elsewhere, match the existing append target instead of `c.append(sec)`.

- [ ] **Step 2: Rebuild + manual verify**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`
As a user with no projects, open `/app/vt-projects`. Expected: a dashed card with a "Buat Proyek pertama Anda" button (clicking opens the new project form).

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/page/vt_projects/vt_projects.js
git commit -m "feat(proyek): empty-state dgn CTA Buat Proyek pertama"
```

---

## Task 10: vt-home — primary action, quick-create, empty state, onboarding card

**Files:**
- Modify: `vernon_tasks/task/page/vt_home/vt_home.js`
- Modify: `vernon_tasks/task/page/vt_home/vt_home.css` (onboarding card styles)

- [ ] **Step 1: Add a quick-create project helper + primary action**

In `vt_home.js`, add this helper near the top-level functions:

```javascript
const PROJECT_DOCTYPE = "VT Project";

function vt_quick_create_project(on_done) {
    const d = new frappe.ui.Dialog({
        title: "Buat Proyek",
        fields: [
            { fieldname: "title", label: "Nama Proyek", fieldtype: "Data", reqd: 1 },
            { fieldname: "brand", label: "Brand", fieldtype: "Link", options: "VT Brand", reqd: 1 },
        ],
        primary_action_label: "Buat",
        primary_action: (v) => {
            frappe.db.insert({
                doctype: PROJECT_DOCTYPE, title: v.title, brand: v.brand,
                project_owner: frappe.session.user, project_leader: frappe.session.user,
                start_date: frappe.datetime.get_today(),
                end_date: frappe.datetime.add_days(frappe.datetime.get_today(), 30),
            }).then((doc) => {
                d.hide();
                frappe.show_alert({ message: "Proyek dibuat", indicator: "green" });
                if (on_done) on_done(doc);
                else frappe.set_route("vt-project-detail", doc.name);
            });
        },
    });
    d.show();
}
```

In `on_page_load` (after the existing `page.add_button(__("Refresh"), ...)` at line ~25), add:

```javascript
    page.set_primary_action(__("Buat Proyek"), () => vt_quick_create_project(), "add");
```

- [ ] **Step 2: Render the onboarding card (after hero)**

In `render_all` (line ~32), add a call right after `render_hero(c);`:

```javascript
    render_onboarding(c);
```

Then add the `render_onboarding` function:

```javascript
const ONB_API = "vernon_tasks.task.api.onboarding";

function render_onboarding(c) {
    const sec = $('<div class="vh-section" data-block="onboarding"></div>');
    c.append(sec);
    frappe.call(`${ONB_API}.get_onboarding_state`).then((r) => {
        const st = r.message || {};
        if (!st.show) { sec.remove(); return; }
        const card = $('<div class="vh-card vh-onboarding"></div>');
        card.append(`<div class="vh-onb-head">
            <span class="vh-section-title">Mulai di sini</span>
            <span class="vh-onb-progress">${st.progress.done}/${st.progress.total}</span>
            <button class="vh-onb-dismiss btn btn-xs">Sembunyikan</button></div>`);
        (st.steps || []).forEach((s) => card.append(render_onb_step(s)));
        const cta = $('<div class="vh-onb-cta"></div>');
        if (st.has_demo) {
            cta.append($('<button class="btn btn-default btn-sm">Hapus data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.clear_demo`).then(() => render_all(page_ref(c)))));
        } else {
            cta.append($('<button class="btn btn-default btn-sm">Muat data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.load_demo`).then(() => render_all(page_ref(c)))));
        }
        card.append(cta);
        card.find(".vh-onb-dismiss").on("click", () =>
            frappe.call(`${ONB_API}.dismiss_onboarding`).then(() => sec.remove()));
        sec.append(card);
    });
}

function render_onb_step(s) {
    const mark = s.is_complete ? "✓" : "○";
    const row = $(`<div class="vh-onb-step ${s.is_complete ? "done" : ""}">
        <span class="vh-onb-mark">${mark}</span>
        <span class="vh-onb-title">${frappe.utils.escape_html(s.title)}</span></div>`);
    if (!s.is_complete) {
        row.css("cursor", "pointer").on("click", () => onb_route(s));
    }
    return row;
}

function onb_route(s) {
    if (s.route_kind === "page") frappe.set_route(s.route_target);
    else if (s.route_kind === "new_doc") frappe.new_doc(s.route_target);
    else if (s.route_kind === "quick_create_project") vt_quick_create_project();
}
```

Add a tiny helper to re-render after demo load/clear. Since `render_all(page)` needs the `page` object, capture it: at the top of `render_all`, the `page` parameter is already in scope; replace the `page_ref(c)` calls by passing `page` through. Concretely, change `render_onboarding(c)` to `render_onboarding(c, page)` and thread `page` into the demo button handlers (`render_all(page)`), removing the `page_ref` placeholder.

Final shape of the two demo handlers:
```javascript
            cta.append($('<button class="btn btn-default btn-sm">Hapus data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.clear_demo`).then(() => render_all(page))));
```
```javascript
            cta.append($('<button class="btn btn-default btn-sm">Muat data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.load_demo`).then(() => render_all(page))));
```
and the signature `function render_onboarding(c, page) {`, called as `render_onboarding(c, page);`.

- [ ] **Step 3: Add a first-run welcome empty-state when the dashboard is bare**

In `render_projects` (line ~117), replace:
```javascript
    if (!led.length && !member.length) { sec.append('<div class="vh-empty">Belum ada proyek.</div>'); }
```
with:
```javascript
    if (!led.length && !member.length) {
        sec.append(vt_render_empty_state({
            title: "Belum ada proyek",
            message: "Buat proyek pertama untuk mulai bekerja, atau muat data contoh dari kartu di atas.",
            cta_label: "Buat Proyek",
            on_cta: () => vt_quick_create_project(),
        }));
    }
```

- [ ] **Step 4: Add onboarding card CSS**

Append to `vernon_tasks/task/page/vt_home/vt_home.css`:

```css
.vt-home .vh-onboarding { padding: 16px; }
.vt-home .vh-onb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.vt-home .vh-onb-progress { font-size: 12px; color: #64748b; font-weight: 600; }
.vt-home .vh-onb-dismiss { margin-left: auto; }
.vt-home .vh-onb-step { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-top: 1px solid #f1f5f9; }
.vt-home .vh-onb-step.done { color: #94a3b8; }
.vt-home .vh-onb-step.done .vh-onb-mark { color: #16a34a; }
.vt-home .vh-onb-mark { width: 16px; text-align: center; font-weight: 700; }
.vt-home .vh-onb-cta { margin-top: 12px; display: flex; gap: 8px; }
```

- [ ] **Step 5: Rebuild assets**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`

- [ ] **Step 6: Manual verify (acceptance)**

As a fresh `VT Member` user with no data, open `/app/vt-home`:
- Onboarding card "Mulai di sini" shows `0/4`, steps clickable.
- Header has a primary "Buat Proyek" button → quick-create dialog (Nama + Brand).
- "Muat data contoh" populates the dashboard; card flips the demo button to "Hapus data contoh"; completed steps show a green ✓.
- "Hapus data contoh" restores the empty state.
- "Sembunyikan" removes the card; reloading keeps it hidden (per-user dismiss).

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/task/page/vt_home/vt_home.js vernon_tasks/task/page/vt_home/vt_home.css
git commit -m "feat(beranda): primary action, quick-create, empty-state, kartu onboarding"
```

---

## Task 11: Update docs (mandatory per vernon-dev)

**Files:**
- Modify: `docs/implementation-tracker.html` (add the onboarding-foundation rows + recalc summary)
- Modify: `vernon_tasks/CLAUDE.md` only if architecture notes changed (new `setup/` package, onboarding API)

- [ ] **Step 1: Record the feature in the tracker**

Add a tracker entry referencing this plan and the spec `docs/superpowers/specs/2026-06-01-onboarding-foundation-design.html`, with the Tests column listing the four new test modules. Recalculate the summary table.

- [ ] **Step 2: Note the new module in CLAUDE.md (if needed)**

If `vernon_tasks/CLAUDE.md` documents module layout, add: `setup/` (roles, demo_data, onboarding_seed) and `task/api/onboarding.py`.

- [ ] **Step 3: Commit**

```bash
git add docs/ vernon_tasks/CLAUDE.md
git commit -m "docs(onboarding): catat onboarding foundation di tracker + CLAUDE"
```

---

## Final verification (whole-feature)

- [ ] Run the full new-test set:
  `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.setup.test_roles`
  `... --module vernon_tasks.setup.test_demo_data`
  `... --module vernon_tasks.task.api.test_onboarding`
  `... --module vernon_tasks.tests.test_navbar_seed`
  Expected: all PASS.
- [ ] Run the existing boot/navbar test to confirm no regression:
  `... --module vernon_tasks.tests.test_boot_navbar`
- [ ] `docker restart frappe-backend-1` then walk the acceptance path in Task 10 Step 6 with a brand-new user.
- [ ] Confirm fixtures committed under `vernon_tasks/fixtures/` (module_onboarding, onboarding_step, onboarding_step_map).

---

## Self-review notes (coverage map: spec → task)

- Auto-grant role → Task 2. Navbar seed-if-empty → Task 3. Routing fix → Task 7.
- Shared empty-state + CTA → Task 8/9, applied on vt-home → Task 10 Step 3.
- Primary create action → Task 10 Step 1. Hybrid onboarding card + derived completion → Task 5 + Task 10 Step 2.
- Native fixtures + workspace block → Task 6. Demo load/clear → Task 4 (+ API Task 5, UI Task 10 Step 2).
- `demo_data_refs` schema → Task 1. Docs → Task 11.
- Deferred (NOT in plan, by design): VT Settings editor bug, translations, tooltips, analytics auto-select, component standardization.
