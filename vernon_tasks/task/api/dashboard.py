"""Mobile mix-view dashboard API.

Spec: docs/superpowers/specs/2026-05-22-dashboard-mix-view-design.html

VT Item tree model (unified hierarchy):
- Project / Sprint / Task are `node_type` values on the single `VT Item`
  nested-set tree; all reads go through `vt_item_tree`.
- Legacy flat Link relations are gone: a Task's project is its nearest Project
  ancestor (tree.project_of); a Task's sprint is its direct parent when that
  parent is a Sprint node; a Sprint/Task belongs to its Project via the nested
  set (descendants), not a `project` column.
- Field renames: assigned_to / project_owner → owner_user, project_leader →
  leader_user, Project status → health_status, Sprint status → sprint_state,
  Sprint sprint_title → title. Data field names preserved (pdca_phase, deadline,
  start_date, end_date, base_points, earned_points, revision_count,
  completion_date, estimated_minutes, actual_minutes, priority, risk_flag).
- The terminal task phase is CLOSED (legacy "DONE"); kanban_status is derived
  from pdca_phase by the controller, except "Blocked" which is set directly.
- Team members / milestones remain child tables on the Project VT Item node
  (parenttype 'VT Item'). Task Dependency is the `dependencies` child table on
  the Task node. Task Point Log + Vernon Meeting are not part of the merge.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any

import frappe
from frappe.utils import add_days, getdate, today

from vernon_tasks.task.api.security import require_login
from vernon_tasks.task.doctype.vt_item.vt_item import (
    KANBAN_BLOCKED,
    PDCA_KANBAN_MAP,
)
from vernon_tasks.task.services import vt_item_tree as tree

# All Project / Sprint / Task reads target the unified VT Item tree doctype.
ITEM_DOCTYPE = "VT Item"
# node_type discriminators on the VT Item tree.
PROJECT_NODE_TYPE = "Project"
SPRINT_NODE_TYPE = "Sprint"
TASK_NODE_TYPE = "Task"

# Permission checks still operate on the VT Item doctype name.
TASK_DOCTYPE = ITEM_DOCTYPE
PROJECT_DOCTYPE = ITEM_DOCTYPE
SPRINT_DOCTYPE = ITEM_DOCTYPE

# Renamed field used everywhere the legacy code said assigned_to/project_owner.
OWNER_FIELD = "owner_user"
LEADER_FIELD = "leader_user"
# Project status → health_status; the closed/archived value is "Closed".
PROJECT_CLOSED_STATUS = "Closed"
# Sprint status → sprint_state; the active value is "Active".
SPRINT_ACTIVE_STATE = "Active"
# Unified terminal task phase (legacy VT Task "DONE").
DONE_PHASE = "CLOSED"

# Board column ↔ PDCA phase, derived from the unified map (terminal = CLOSED).
KANBAN_PDCA_MAP = {v: k for k, v in PDCA_KANBAN_MAP.items()}
BOARD_COLUMNS = tuple(PDCA_KANBAN_MAP.values()) + (KANBAN_BLOCKED,)
# Legal PDCA transitions (unified: terminal phase is CLOSED). Drives the board's
# drag-target UX hints only; the server still re-validates every move elsewhere.
VALID_PDCA_TRANSITIONS = {
    "BACKLOG": ["PLAN"],
    "PLAN": ["DO"],
    "DO": ["CHECK"],
    "CHECK": ["ACT", "CLOSED", "DO"],
    "ACT": ["DO"],
    "CLOSED": [],
}

# Card field set shared by the detail open-task list and the project board.
# assigned_to → owner_user on VT Item Task nodes.
_BOARD_TASK_FIELDS = (
    "name", "title", "kanban_status", "pdca_phase",
    "priority", "start_date", "deadline", "risk_flag", "owner_user",
)
# Priority sort weight (Critical first) for in-column ordering.
_PRIORITY_RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
# Priority options (low→high) for the inline-edit dropdown.
PRIORITY_OPTIONS = ("Low", "Medium", "High", "Critical")

VELOCITY_WEEKS = 8
NEXT_ACTIONS_LIMIT = 5
DUE_SOON_DAYS = 3
SCHEDULE_WINDOW_DAYS = 7  # today + next 7 = 8-day window

RISK_ELAPSED_THRESHOLD = 60.0
RISK_DONE_THRESHOLD = 50.0
AT_RISK_DUE_COUNT = 2

ADMIN_ROLES = ("System Manager", "Vernon Admin")
PRIORITY_RANK = {"High": 0, "Medium": 1, "Low": 2}


# ── helpers ──────────────────────────────────────────────────────────────────


def _is_admin() -> bool:
    roles = frappe.get_roles(frappe.session.user)
    return any(r in roles for r in ADMIN_ROLES)


def _iso_week_key(d: datetime.date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _calc_risk(done_pct: float, elapsed_pct: float) -> str:
    if elapsed_pct > RISK_ELAPSED_THRESHOLD and done_pct < RISK_DONE_THRESHOLD:
        return "behind"
    if elapsed_pct > RISK_ELAPSED_THRESHOLD and done_pct < (RISK_DONE_THRESHOLD + 20):
        return "at_risk"
    return "on_track"


def _elapsed_pct(start: datetime.date, end: datetime.date, ref: datetime.date) -> float:
    total = (end - start).days
    if total <= 0:
        return 100.0 if ref >= end else 0.0
    used = max(0, (ref - start).days)
    return min(100.0, used / total * 100.0)


# ── 1. me_progress ───────────────────────────────────────────────────────────


def _velocity_buckets(user: str, ref: datetime.date) -> tuple[list[dict], int]:
    window_start = add_days(ref, -7 * VELOCITY_WEEKS)
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={
            OWNER_FIELD: user,
            "pdca_phase": DONE_PHASE,
            "completion_date": [">=", window_start],
        },
        fields=["completion_date"],
    )
    by_week: dict[str, int] = defaultdict(int)
    for r in rows:
        d = getdate(r["completion_date"])
        by_week[_iso_week_key(d)] += 1

    weeks: list[dict] = []
    for i in range(VELOCITY_WEEKS - 1, -1, -1):
        d = add_days(ref, -7 * i)
        key = _iso_week_key(getdate(d))
        weeks.append({"week": key, "done": by_week.get(key, 0)})

    this_w = weeks[-1]["done"] if weeks else 0
    prev_w = weeks[-2]["done"] if len(weeks) >= 2 else 0
    return weeks, this_w - prev_w


def _active_sprint_for_user(user: str, ref: datetime.date) -> dict | None:
    sprints = tree.nodes(
        SPRINT_NODE_TYPE,
        filters={
            "sprint_state": SPRINT_ACTIVE_STATE,
            "start_date": ["<=", ref],
            "end_date": [">=", ref],
        },
        fields=["name", "title AS sprint_title", "start_date", "end_date"],
        order_by="end_date asc",
        limit=20,
    )
    for s in sprints:
        # A Sprint's tasks are its tree children (was VT Task.sprint=s.name).
        mine = tree.children(
            s["name"], TASK_NODE_TYPE, filters={OWNER_FIELD: user}, fields=["name"]
        )
        if mine:
            return s
    return None


def _sprint_summary(sprint: dict, user: str, ref: datetime.date) -> dict:
    rows = tree.children(
        sprint["name"], TASK_NODE_TYPE, filters={OWNER_FIELD: user},
        fields=["base_points", "pdca_phase"],
    )
    committed = sum(int(r.get("base_points") or 0) for r in rows)
    done = sum(
        int(r.get("base_points") or 0)
        for r in rows
        if r.get("pdca_phase") == DONE_PHASE
    )
    progress = (done / committed * 100.0) if committed else 0.0
    elapsed = _elapsed_pct(getdate(sprint["start_date"]), getdate(sprint["end_date"]), ref)
    return {
        "name": sprint["sprint_title"] or sprint["name"],
        "start_date": str(sprint["start_date"]),
        "end_date": str(sprint["end_date"]),
        "committed_points": committed,
        "done_points": done,
        "progress_pct": round(progress, 1),
        "risk": _calc_risk(progress, elapsed),
    }


def _workload(user: str, ref: datetime.date) -> dict:
    soon_cap = add_days(ref, DUE_SOON_DAYS)
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": ["!=", DONE_PHASE]},
        fields=["deadline"],
    )
    open_n = overdue = due_soon = 0
    for r in rows:
        open_n += 1
        d = r.get("deadline")
        if not d:
            continue
        d = getdate(d)
        if d < ref:
            overdue += 1
        elif d <= getdate(soon_cap):
            due_soon += 1
    return {"open": open_n, "overdue": overdue, "due_soon": due_soon}


def _next_actions(user: str) -> list[dict]:
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": ["!=", DONE_PHASE]},
        fields=["name", "title", "deadline", "priority"],
        limit=200,
    )
    rows.sort(
        key=lambda r: (
            PRIORITY_RANK.get(r.get("priority") or "Medium", 1),
            r.get("deadline") or datetime.date.max,
        )
    )
    return [
        {
            "id": r["name"],
            "title": r.get("title"),
            # A Task's project is its nearest Project ancestor in the tree.
            "project": tree.project_of(r["name"]),
            "deadline": str(r["deadline"]) if r.get("deadline") else None,
            "priority": r.get("priority"),
        }
        for r in rows[:NEXT_ACTIONS_LIMIT]
    ]


@frappe.whitelist()
def me_progress() -> dict[str, Any]:
    require_login()
    user = frappe.session.user
    ref = getdate(today())

    velocity, delta = _velocity_buckets(user, ref)
    sprint_raw = _active_sprint_for_user(user, ref)
    sprint = _sprint_summary(sprint_raw, user, ref) if sprint_raw else None

    return {
        "velocity": velocity,
        "velocity_delta": delta,
        "sprint": sprint,
        "workload": _workload(user, ref),
        "next_actions": _next_actions(user),
    }


# ── 2. my_projects ───────────────────────────────────────────────────────────


def _user_project_ids(user: str) -> tuple[set[str], set[str]]:
    # Projects the user leads: VT Project.project_leader → Project node
    # leader_user (Link → User) on the VT Item tree.
    led_rows = tree.nodes(
        PROJECT_NODE_TYPE, filters={LEADER_FIELD: user}, fields=["name"]
    )
    led = {r["name"] for r in led_rows}

    # Team membership: `Project Team Member` is now a child table on the Project
    # VT Item node (parenttype 'VT Item', was 'VT Project').
    member_rows = frappe.db.sql(
        """
        SELECT DISTINCT parent FROM `tabProject Team Member`
        WHERE user = %s AND parenttype = %s
        """,
        (user, ITEM_DOCTYPE),
        as_dict=True,
    )
    member = {r["parent"] for r in member_rows} - led
    return led, member


def _project_active_sprint(project_id: str, ref: datetime.date) -> dict | None:
    # A Sprint is a direct child of its Project (was VT Sprint.project=P).
    rows = tree.children(
        project_id,
        SPRINT_NODE_TYPE,
        filters={
            "sprint_state": SPRINT_ACTIVE_STATE,
            "start_date": ["<=", ref],
            "end_date": [">=", ref],
        },
        fields=["name", "title AS sprint_title", "start_date", "end_date"],
        order_by="end_date asc",
        limit=1,
    )
    return rows[0] if rows else None


def _burndown(sprint: dict, ref: datetime.date) -> tuple[list[float], list[float]]:
    start = getdate(sprint["start_date"])
    end = getdate(sprint["end_date"])
    days = max(1, (end - start).days)
    # A Sprint's tasks are its tree children (was VT Task.sprint=sprint name).
    total_points = sum(
        int(r.get("base_points") or 0)
        for r in tree.children(
            sprint["name"], TASK_NODE_TYPE, fields=["base_points"]
        )
    )
    horizon = min(7, days + 1)
    ideal = [
        round(total_points * (1 - i / days), 1)
        for i in range(horizon)
    ]
    done_by_day = defaultdict(int)
    rows = tree.children(
        sprint["name"],
        TASK_NODE_TYPE,
        filters={"pdca_phase": DONE_PHASE, "completion_date": ["is", "set"]},
        fields=["completion_date", "base_points"],
    )
    for r in rows:
        d = getdate(r["completion_date"])
        done_by_day[d] += int(r.get("base_points") or 0)
    actual: list[float] = []
    remaining = float(total_points)
    for i in range(horizon):
        d = add_days(start, i)
        if getdate(d) > ref:
            break
        remaining -= done_by_day.get(getdate(d), 0)
        actual.append(round(max(0.0, remaining), 1))
    return ideal, actual


def _project_card(project_id: str, ref: datetime.date) -> dict:
    # Project status → health_status; surfaced under the legacy "status" key.
    proj = frappe.get_value(
        PROJECT_DOCTYPE,
        project_id,
        ["title", "health_status AS status", "percent_done"],
        as_dict=True,
    ) or {}
    sprint = _project_active_sprint(project_id, ref)
    sprint_block = None
    if sprint:
        ideal, actual = _burndown(sprint, ref)
        sprint_block = {
            "name": sprint["sprint_title"] or sprint["name"],
            "start": str(sprint["start_date"]),
            "end": str(sprint["end_date"]),
            "burndown_ideal": ideal,
            "burndown_actual": actual,
        }

    # All of the project's tasks are its nested-set descendants (spanning any
    # Sprint level); was VT Task.project=project_id.
    task_rows = tree.descendants(
        project_id,
        TASK_NODE_TYPE,
        fields=["kanban_status", "risk_flag", "deadline"],
    )
    open_tasks = sum(1 for r in task_rows if r.get("kanban_status") not in ("Done", "Cancelled"))
    blockers = sum(1 for r in task_rows if r.get("risk_flag"))
    soon = add_days(ref, DUE_SOON_DAYS)
    overdue = sum(
        1
        for r in task_rows
        if r.get("deadline")
        and r.get("kanban_status") not in ("Done", "Cancelled")
        and getdate(r["deadline"]) < ref
    )
    due_soon = sum(
        1
        for r in task_rows
        if r.get("deadline")
        and r.get("kanban_status") not in ("Done", "Cancelled")
        and ref <= getdate(r["deadline"]) <= getdate(soon)
    )
    risk = "on_track"
    if sprint_block:
        # A Sprint's tasks are its tree children (was VT Task.sprint=name).
        committed = sum(int(r.get("base_points") or 0)
                        for r in tree.children(sprint["name"], TASK_NODE_TYPE,
                                               fields=["base_points"]))
        done = sum(int(r.get("base_points") or 0)
                   for r in tree.children(sprint["name"], TASK_NODE_TYPE,
                                          filters={"pdca_phase": DONE_PHASE},
                                          fields=["base_points"]))
        progress = (done / committed * 100.0) if committed else 0.0
        elapsed = _elapsed_pct(getdate(sprint["start_date"]), getdate(sprint["end_date"]), ref)
        risk = _calc_risk(progress, elapsed)
    if blockers > 0 or (overdue + due_soon) > AT_RISK_DUE_COUNT:
        if risk == "on_track":
            risk = "at_risk"

    return {
        "id": project_id,
        "name": proj.get("title") or project_id,
        "status": proj.get("status"),
        "sprint": sprint_block,
        "pct_done": round(float(proj.get("percent_done") or 0), 1),
        "open_tasks": open_tasks,
        "blockers": blockers,
        "risk": risk,
    }


def _project_row(project_id: str, user: str) -> dict:
    proj = frappe.get_value(
        PROJECT_DOCTYPE,
        project_id,
        ["title", "percent_done"],
        as_dict=True,
    ) or {}
    # Milestones are a child table (`milestones`) on the Project VT Item node;
    # pick the earliest still-open one (status != Done).
    open_ms = [
        m for m in tree.child_table_rows(project_id, "milestones")
        if m.get("status") != "Done" and m.get("due_date")
    ]
    open_ms.sort(key=lambda m: m["due_date"])
    next_ms = str(open_ms[0]["due_date"]) if open_ms else None
    # The user's open tasks anywhere in the project subtree (spans Sprint level);
    # was VT Task WHERE project=… AND assigned_to=user AND open.
    my_open = len(tree.descendants(
        project_id,
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": ["!=", DONE_PHASE]},
        fields=["name"],
    ))
    return {
        "id": project_id,
        "name": proj.get("title") or project_id,
        "pct_done": round(float(proj.get("percent_done") or 0), 1),
        "next_milestone": next_ms,
        "my_open_tasks": my_open,
    }


@frappe.whitelist()
def my_projects(filter: str = "all") -> dict[str, Any]:
    require_login()
    user = frappe.session.user
    ref = getdate(today())
    is_admin = _is_admin()

    if is_admin:
        # Project status → health_status; "Archived" maps to the closed value.
        all_rows = tree.nodes(
            PROJECT_NODE_TYPE,
            filters={"health_status": ["!=", PROJECT_CLOSED_STATUS]},
            fields=["name"],
        )
        led_ids = {r["name"] for r in all_rows}
        member_ids: set[str] = set()
        if filter == "led":
            led_rows = tree.nodes(
                PROJECT_NODE_TYPE, filters={LEADER_FIELD: user}, fields=["name"]
            )
            led_ids = {r["name"] for r in led_rows}
    else:
        led_ids, member_ids = _user_project_ids(user)
        if filter == "led":
            member_ids = set()
        elif filter == "member":
            led_ids = set()

    led_cards = [_project_card(p, ref) for p in sorted(led_ids)]
    member_rows = [] if is_admin else [_project_row(p, user) for p in sorted(member_ids)]

    if filter == "at_risk":
        led_cards = [c for c in led_cards if c["risk"] in ("at_risk", "behind")]
        member_rows = []

    return {"is_admin": is_admin, "led": led_cards, "member": member_rows}


# ── 2b. project_detail ───────────────────────────────────────────────────────

DETAIL_TASK_LIMIT = 200
CLOSED_STATUSES = ("Done", "Cancelled")
DONE_STATUS = "Done"


def _assert_project_access(project_id: str, user: str) -> None:
    if _is_admin():
        return
    led, member = _user_project_ids(user)
    if project_id not in led and project_id not in member:
        raise frappe.PermissionError(f"No access to project {project_id}")


def _detail_header(project_id: str, card: dict, ref: datetime.date) -> dict:
    # Project renames: status → health_status, project_leader → leader_user.
    proj = frappe.get_value(
        PROJECT_DOCTYPE,
        project_id,
        ["title", "health_status AS status", "pdca_phase", "percent_done",
         "leader_user AS project_leader", "start_date", "end_date"],
        as_dict=True,
    ) or {}
    return {
        "id": project_id,
        "title": proj.get("title") or project_id,
        "status": proj.get("status"),
        "pdca_phase": proj.get("pdca_phase"),
        "percent_done": card.get("pct_done", 0),
        "risk": card.get("risk", "on_track"),
        "leader": proj.get("project_leader"),
        "start_date": str(proj["start_date"]) if proj.get("start_date") else None,
        "end_date": str(proj["end_date"]) if proj.get("end_date") else None,
        "sprint": card.get("sprint"),
    }


def _map_task_row(r: dict, ref: datetime.date | None = None) -> dict:
    """Map a raw VT Task row to the card dict used by the detail list + board.

    `overdue` is computed server-side (site-tz) so the Fokus feed Terlambat /
    Jatuh Tempo buckets never drift with the browser clock — `getdate` on both
    sides, comparing against `ref` (today in the site timezone). Callers pass a
    single `ref` so we don't recompute today() per row; default keeps it correct
    when called standalone. A task due *today* is NOT overdue (strict `<`).
    """
    if ref is None:
        ref = getdate(today())
    deadline = getdate(r["deadline"]) if r.get("deadline") else None
    return {
        "id": r["name"],
        "title": r.get("title"),
        "kanban_status": r.get("kanban_status"),
        "pdca_phase": r.get("pdca_phase"),
        "priority": r.get("priority"),
        "start_date": str(r["start_date"]) if r.get("start_date") else None,
        "deadline": str(deadline) if deadline else None,
        "overdue": bool(deadline and deadline < ref),
        "due_today": bool(deadline and deadline == ref),
        "risk_flag": bool(r.get("risk_flag")),
        # Response key preserved; sourced from the renamed owner_user field.
        "assigned_to": r.get("owner_user"),
    }


def _project_tasks(project_id: str, *, include_closed: bool) -> list[dict]:
    """Fetch a project's task cards. Excludes closed statuses unless requested.

    Shared by `_detail_open_tasks` (open only) and `project_board` (all tasks)
    so the card shape and query stay in one place.
    """
    filters: dict = {}
    if not include_closed:
        filters["kanban_status"] = ["not in", CLOSED_STATUSES]
    # A project's tasks are its nested-set descendants (spanning any Sprint
    # level); was VT Task.project=project_id. descendants() has no limit arg, so
    # cap the card list to DETAIL_TASK_LIMIT after the (deadline-ordered) fetch.
    rows = tree.descendants(
        project_id,
        TASK_NODE_TYPE,
        filters=filters,
        fields=list(_BOARD_TASK_FIELDS),
        order_by="deadline asc",
    )[:DETAIL_TASK_LIMIT]
    ref = getdate(today())  # one site-tz "today" for all card overdue flags
    return [_map_task_row(r, ref) for r in rows]


def _detail_open_tasks(project_id: str) -> list[dict]:
    return _project_tasks(project_id, include_closed=False)


def _detail_counts(project_id: str) -> dict[str, int]:
    """Authoritative (uncapped) task tallies for the hero meta row.

    Uses ``frappe.db.count`` rather than the ``DETAIL_TASK_LIMIT``-capped open
    list so the numbers stay honest on projects with >200 tasks. ``open`` mirrors
    the board's CLOSED_STATUSES contract, so ``open + done`` may be < ``total``
    when there are Cancelled tasks (the remainder is intentionally not shown).
    """
    # Tallies over the project's nested-set Task descendants (was db.count on
    # VT Task WHERE project=project_id). done = kanban "Done" column.
    total = len(tree.descendants(project_id, TASK_NODE_TYPE, fields=["name"]))
    done = len(tree.descendants(
        project_id, TASK_NODE_TYPE,
        filters={"kanban_status": DONE_STATUS}, fields=["name"]))
    open_count = len(tree.descendants(
        project_id, TASK_NODE_TYPE,
        filters={"kanban_status": ["not in", CLOSED_STATUSES]}, fields=["name"]))
    return {"total": total, "open": open_count, "done": done}


def _detail_team(doc) -> list[dict]:
    return [
        {"user": getattr(m, "user", None), "role": getattr(m, "role", None)}
        for m in (getattr(doc, "team_members", None) or [])
    ]


def _detail_milestones(doc) -> list[dict]:
    out = []
    for m in (getattr(doc, "milestones", None) or []):
        due = getattr(m, "due_date", None)
        out.append({
            "title": getattr(m, "milestone_title", None),
            "due_date": str(due) if due else None,
            "status": getattr(m, "status", None),
        })
    return out


@frappe.whitelist()
def project_detail(project_id: str) -> dict[str, Any]:
    """Read-only detail dashboard for one project.

    Access: admin, the project_leader, or a team member only.
    Reuses _project_card for risk/percent/sprint; reads child tables directly.
    """
    require_login()
    user = frappe.session.user
    ref = getdate(today())
    _assert_project_access(project_id, user)

    card = _project_card(project_id, ref)
    open_tasks = _detail_open_tasks(project_id)
    doc = frappe.get_doc(PROJECT_DOCTYPE, project_id)
    return {
        "header": _detail_header(project_id, card, ref),
        "counts": _detail_counts(project_id),
        "open_tasks": open_tasks,
        "team_members": _detail_team(doc),
        "milestones": _detail_milestones(doc),
        "blockers": card.get("blockers", 0),
    }


# ── 2b. project_board (kanban) ───────────────────────────────────────────────


def _card_sort_key(t: dict):
    """In-column ordering: priority (Critical first), then earliest deadline."""
    return (_PRIORITY_RANK.get(t.get("priority"), 9), t.get("deadline") or "9999-12-31")


def _allowed_targets(task: dict) -> list[str]:
    """Board columns this card may legally move to (drives UI drag highlighting).

    - Blocked card → only its real-phase column (un-block; drop target ignored).
    - DONE phase   → none (terminal — card is locked).
    - otherwise    → legal PDCA transitions mapped to columns, plus Blocked.
    The server still re-validates every move; this is a UX hint only.
    """
    phase = task.get("pdca_phase")
    if task.get("kanban_status") == KANBAN_BLOCKED:
        return [PDCA_KANBAN_MAP[phase]] if phase in PDCA_KANBAN_MAP else []
    targets = [PDCA_KANBAN_MAP[nxt] for nxt in VALID_PDCA_TRANSITIONS.get(phase, [])]
    if targets:  # any non-terminal card can also be flagged Blocked
        targets.append(KANBAN_BLOCKED)
    return targets


def _group_board_columns(tasks: list[dict]) -> list[dict]:
    """Group cards into ordered board columns, sorted within each column.

    Cards whose kanban_status is not a known board column (e.g. legacy
    Cancelled) are skipped defensively so they never silently disappear into a
    wrong column.
    """
    buckets: dict[str, list[dict]] = {col: [] for col in BOARD_COLUMNS}
    for t in tasks:
        col = t.get("kanban_status")
        if col in buckets:
            t["allowed_targets"] = _allowed_targets(t)
            buckets[col].append(t)
    for col_tasks in buckets.values():
        col_tasks.sort(key=_card_sort_key)
    return [
        {"key": col, "label": col, "pdca_phase": KANBAN_PDCA_MAP.get(col),
         "tasks": buckets[col]}
        for col in BOARD_COLUMNS
    ]


def _board_team(doc) -> list[dict]:
    """Project roster (+leader) for the assignee inline-edit dropdown."""
    users = {m.user for m in (doc.team_members or []) if getattr(m, "user", None)}
    # project_leader → leader_user on the Project VT Item node.
    if doc.leader_user:
        users.add(doc.leader_user)
    if not users:
        return []
    rows = frappe.get_all(
        "User", filters=[["name", "in", list(users)]],
        fields=["name", "full_name"], limit_page_length=0,
    )
    return [{"user": r["name"], "full_name": r.get("full_name") or r["name"]} for r in rows]


@frappe.whitelist()
def project_board(project_id: str) -> dict:
    """Read-only kanban board for one project: all tasks grouped by column.

    Access mirrors project_detail (admin / leader / member). Reuses the shared
    `_project_tasks` fetcher so column cards match the detail list's shape.
    """
    require_login()
    _assert_project_access(project_id, frappe.session.user)
    tasks = _project_tasks(project_id, include_closed=True)
    doc = frappe.get_doc(PROJECT_DOCTYPE, project_id)
    return {
        "columns": _group_board_columns(tasks),
        "team": _board_team(doc),
        "priorities": list(PRIORITY_OPTIONS),
    }


# ── 2c. project_sprints (sprint tab) ─────────────────────────────────────────


# Sprint header fields surfaced on the project detail Sprint tab. Renames:
# sprint_title → title, status → sprint_state (aliased back to legacy keys).
_SPRINT_FIELDS = (
    "name", "title AS sprint_title", "start_date", "end_date",
    "sprint_state AS status", "percent_done", "goal",
)


def _map_sprint_row(r: dict) -> dict:
    """Map a raw Sprint VT Item row to the sprint-card dict used by the tab."""
    return {
        "id": r["name"],
        "title": r.get("sprint_title") or r["name"],
        "start_date": str(r["start_date"]) if r.get("start_date") else None,
        "end_date": str(r["end_date"]) if r.get("end_date") else None,
        "status": r.get("status"),
        "percent_done": r.get("percent_done") or 0,
        "goal": r.get("goal"),
        "tasks": [],
    }


@frappe.whitelist()
def project_sprints(project_id: str) -> dict:
    """Sprints of one project, each with its assigned task cards (Sprint tab).

    Access mirrors project_board (admin / leader / member). Every project task is
    bucketed onto its sprint; tasks with no sprint are returned under
    ``unassigned`` so the tab can surface backlog-without-sprint in one call.
    """
    require_login()
    _assert_project_access(project_id, frappe.session.user)
    # Sprints are the project's direct Sprint children (was VT Sprint.project=P).
    sprints = tree.children(
        project_id, SPRINT_NODE_TYPE,
        fields=list(_SPRINT_FIELDS), order_by="start_date desc",
    )
    by_id = {s["name"]: _map_sprint_row(s) for s in sprints}
    # Every project task is a nested-set descendant; a task's sprint is its tree
    # parent when that parent is one of this project's Sprint nodes (was
    # VT Task.sprint). Tasks with no sprint parent fall into `unassigned`.
    rows = tree.descendants(
        project_id, TASK_NODE_TYPE,
        fields=list(_BOARD_TASK_FIELDS) + ["parent_vt_item"],
        order_by="deadline asc",
    )[:DETAIL_TASK_LIMIT]
    unassigned: list[dict] = []
    ref = getdate(today())  # one site-tz "today" for all card overdue flags
    for r in rows:
        bucket = by_id.get(r.get("parent_vt_item"))
        (bucket["tasks"] if bucket else unassigned).append(_map_task_row(r, ref))
    return {"sprints": list(by_id.values()), "unassigned": unassigned}


# ── 3. schedule_agenda ───────────────────────────────────────────────────────


def _task_agenda_items(user: str, start: datetime.date, end: datetime.date) -> list[dict]:
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={
            OWNER_FIELD: user,
            "pdca_phase": ["!=", DONE_PHASE],
            "deadline": ["between", [start, end]],
        },
        fields=["name", "title", "deadline", "priority"],
        limit=500,
    )
    return [
        {
            "type": "task",
            "id": r["name"],
            "title": r.get("title"),
            # A Task's project is its nearest Project ancestor in the tree.
            "project": tree.project_of(r["name"]),
            "date": str(r["deadline"]),
            "time": None,
            "priority": r.get("priority"),
            "route": f"/app/vt-task/{r['name']}",
        }
        for r in rows
    ]


def _sprint_agenda_items(user: str, start: datetime.date, end: datetime.date) -> list[dict]:
    # The user's sprints are the parents of their Task nodes when that parent is
    # a Sprint (was DISTINCT VT Task.sprint WHERE assigned_to=user).
    user_tasks = tree.nodes(
        TASK_NODE_TYPE, filters={OWNER_FIELD: user}, fields=["parent_vt_item"]
    )
    parents = {t["parent_vt_item"] for t in user_tasks if t.get("parent_vt_item")}
    sprint_ids = [
        p for p in parents
        if frappe.db.get_value(ITEM_DOCTYPE, p, "node_type") == SPRINT_NODE_TYPE
    ]
    if not sprint_ids:
        return []
    rows = tree.nodes(
        SPRINT_NODE_TYPE,
        filters={"name": ["in", sprint_ids]},
        # sprint_title → title; a Sprint's project is its direct parent.
        fields=["name", "title AS sprint_title", "parent_vt_item AS project",
                "start_date", "end_date"],
        limit=200,
    )
    items: list[dict] = []
    for s in rows:
        sd, ed = getdate(s["start_date"]), getdate(s["end_date"])
        if start <= sd <= end:
            items.append({
                "type": "sprint_start",
                "id": s["name"],
                "title": f"Mulai: {s['sprint_title'] or s['name']}",
                "project": s.get("project"),
                "date": str(sd),
                "time": None,
                "priority": None,
                "route": f"/app/vt-project/{s.get('project') or ''}",
            })
        if start <= ed <= end:
            items.append({
                "type": "sprint_end",
                "id": s["name"],
                "title": f"Akhir: {s['sprint_title'] or s['name']}",
                "project": s.get("project"),
                "date": str(ed),
                "time": None,
                "priority": None,
                "route": f"/app/vt-project/{s.get('project') or ''}",
            })
    return items


def _meeting_agenda_items(user: str, start: datetime.date, end: datetime.date) -> list[dict]:
    if not frappe.db.exists("DocType", "Vernon Meeting"):
        return []
    try:
        rows = frappe.get_all(
            "Vernon Meeting",
            filters=[
                ["meeting_date", "between", [start, end]],
            ],
            fields=["name", "title", "project", "meeting_date", "meeting_time"],
            limit_page_length=200,
        )
    except Exception:
        return []
    return [
        {
            "type": "meeting",
            "id": r["name"],
            "title": r.get("title"),
            "project": r.get("project"),
            "date": str(r["meeting_date"]),
            "time": str(r["meeting_time"]) if r.get("meeting_time") else None,
            "priority": None,
            "route": f"/app/vernon-meeting/{r['name']}",
        }
        for r in rows
    ]


@frappe.whitelist()
def schedule_agenda(include: str = "") -> dict[str, Any]:
    require_login()
    user = frappe.session.user
    ref = getdate(today())
    end = add_days(ref, SCHEDULE_WINDOW_DAYS)

    items = (
        _task_agenda_items(user, ref, getdate(end))
        + _sprint_agenda_items(user, ref, getdate(end))
        + _meeting_agenda_items(user, ref, getdate(end))
    )
    # 'google' include reserved; v1 returns nothing.

    today_summary = {
        "tasks": sum(1 for x in items if x["type"] == "task" and getdate(x["date"]) == ref),
        "meetings": sum(1 for x in items if x["type"] == "meeting" and getdate(x["date"]) == ref),
        "sprint_events": sum(
            1 for x in items
            if x["type"] in ("sprint_start", "sprint_end") and getdate(x["date"]) == ref
        ),
    }

    by_day: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        by_day[it["date"]].append(it)

    def _sort_key(it: dict) -> tuple:
        time = it.get("time") or "23:59"
        prio = PRIORITY_RANK.get(it.get("priority") or "Medium", 1)
        return (time, prio, it.get("title") or "")

    days: list[dict] = []
    for i in range(SCHEDULE_WINDOW_DAYS + 1):
        d = add_days(ref, i)
        d_str = str(d)
        day_items = sorted(by_day.get(d_str, []), key=_sort_key)
        if not day_items:
            continue
        if i == 0:
            label = "Today"
        elif i == 1:
            label = "Tomorrow"
        else:
            label = getdate(d).strftime("%A, %d %b")
        days.append({"date": d_str, "label": label, "items": day_items})

    return {"today_summary": today_summary, "days": days}


# ──────────────────────────────────────────────────────────────────────────
#  Personal dashboard (folded from the deleted my-dashboard page).
#  Self-scoped to frappe.session.user; feeds the Beranda tab of vt-home.
# ──────────────────────────────────────────────────────────────────────────

# Phases that count as "finished" — excluded from active/blocked/overdue
# queries. Legacy "DONE" is the unified terminal phase "CLOSED". (DONE_PHASE is
# defined once near the top of the module as "CLOSED".)
CLOSED_PHASES = (DONE_PHASE, "ACT")
DAILY_COMPLETION_DAYS = 7
MINUTES_PER_HOUR = 60.0


@frappe.whitelist()
def personal_stats() -> dict[str, Any]:
    """Headline counts for the Beranda tab: tasks done today / this ISO week,
    points earned this calendar month, and currently-blocked task count.
    Self-scoped. Migrated from my_dashboard.get_employee_stats. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    ref = getdate(today())
    ref_year, ref_week, _ = ref.isocalendar()

    # The user's completed (CLOSED) Task nodes; bucket today/this-week/this-month
    # in Python (was YEARWEEK / YEAR / MONTH SQL on tabVT Task).
    done_rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": DONE_PHASE},
        fields=["completion_date", "earned_points"],
    )
    done_today = done_week = 0
    points_month = 0.0
    for r in done_rows:
        cd = r.get("completion_date")
        if not cd:
            continue
        cd = getdate(cd)
        if cd == ref:
            done_today += 1
        y, w, _ = cd.isocalendar()
        if (y, w) == (ref_year, ref_week):
            done_week += 1
        if cd.year == ref.year and cd.month == ref.month:
            points_month += float(r.get("earned_points") or 0)

    blocked = _blocked_task_count(user)

    return {
        "done_today": int(done_today),
        "done_week": int(done_week),
        "points_month": float(points_month),
        "blocked": int(blocked),
    }


def _blocked_task_count(user: str) -> int:
    """Count the user's open Task nodes that have at least one still-open
    blocker, via the `dependencies` child table (was a join on
    tabTask Dependency + tabVT Task). A task and its blocker both count only
    while NOT in a finished phase (CLOSED_PHASES)."""
    open_tasks = tree.nodes(
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": ["not in", CLOSED_PHASES]},
        fields=["name"],
    )
    blocked = 0
    for t in open_tasks:
        for dep in tree.child_table_rows(t["name"], "dependencies"):
            blocker = dep.get("blocked_by")
            if not blocker:
                continue
            phase = frappe.db.get_value(ITEM_DOCTYPE, blocker, "pdca_phase")
            if phase not in CLOSED_PHASES:
                blocked += 1
                break
    return blocked


@frappe.whitelist()
def daily_completions() -> list[dict[str, Any]]:
    """Tasks the user completed on each of the last 7 days, zero-filled, oldest
    first — for the Beranda completions bar chart. Self-scoped. Migrated from
    my_dashboard.get_daily_completions. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    start = add_days(today(), -(DAILY_COMPLETION_DAYS - 1))

    # The user's CLOSED Task nodes completed in the window; group by day in
    # Python (was GROUP BY completion_date on tabVT Task).
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={
            OWNER_FIELD: user,
            "pdca_phase": DONE_PHASE,
            "completion_date": ["between", [start, today()]],
        },
        fields=["completion_date"],
    )

    counts_by_date: dict[str, int] = defaultdict(int)
    for r in rows:
        cd = r.get("completion_date")
        if cd:
            counts_by_date[str(getdate(cd))] += 1
    out: list[dict[str, Any]] = []
    for i in range(DAILY_COMPLETION_DAYS):
        d = str(add_days(today(), -(DAILY_COMPLETION_DAYS - 1 - i)))
        out.append({"date": d, "count": int(counts_by_date.get(d, 0))})
    return out


@frappe.whitelist()
def hours_summary() -> dict[str, Any]:
    """Logged vs remaining effort across the user's active (non-DONE/ACT) tasks,
    returned in HOURS. Migrated from my_dashboard.get_hours_summary, which
    returned raw minutes while its chart mislabeled them 'Hours' — this fixes the
    unit at the source. Self-scoped. (PRD-dashboard-merge / bug-hours-unit)"""
    require_login()
    user = frappe.session.user

    # The user's active (non-finished) Task nodes; sum effort in Python (was
    # SUM(actual_minutes)/SUM(estimated_minutes) on tabVT Task).
    rows = tree.nodes(
        TASK_NODE_TYPE,
        filters={OWNER_FIELD: user, "pdca_phase": ["not in", CLOSED_PHASES]},
        fields=["actual_minutes", "estimated_minutes"],
    )
    actual = float(sum(int(r.get("actual_minutes") or 0) for r in rows))
    estimated = float(sum(int(r.get("estimated_minutes") or 0) for r in rows))
    remaining = max(0.0, estimated - actual)
    return {
        "logged_hours": round(actual / MINUTES_PER_HOUR, 1),
        "remaining_hours": round(remaining / MINUTES_PER_HOUR, 1),
    }


# ──────────────────────────────────────────────────────────────────────────
#  Team dashboard (folded + re-scoped from the deleted leader-dashboard page).
#  Scope: VT Manager / admin → global; anyone leading >=1 project → led-only.
# ──────────────────────────────────────────────────────────────────────────

MANAGER_ROLE = "VT Manager"
IN_REVIEW_STATUS = "In Review"
CHECK_PHASE = "CHECK"
LEADERBOARD_LIMIT = 10


def _resolve_team_scope(user: str) -> tuple[str, set[str] | None]:
    """Decide a caller's team-view scope. ('global', None) for admins and VT
    Managers; ('led', led_ids) for anyone leading >=1 project; raises
    PermissionError otherwise. Both team_tab_state and team_overview defer to
    this so the rule lives once and the client can never widen its own scope."""
    if _is_admin() or MANAGER_ROLE in frappe.get_roles(user):
        return "global", None
    led, _member = _user_project_ids(user)
    if led:
        return "led", led
    frappe.throw("Not authorized", frappe.PermissionError)


# PDCA phase display order for the team phase-distribution chart (terminal phase
# is the unified CLOSED). Was an SQL FIELD() ordering on tabVT Task.
_PHASE_ORDER = ("BACKLOG", "PLAN", "DO", "CHECK", "ACT", "CLOSED")


def _scoped_task_rows(
    scope: str, led_ids: set[str] | None, fields: list[str],
    extra_filters: dict | None = None,
) -> list[dict]:
    """Task node rows in the caller's team scope (was the ' AND project IN (...)'
    SQL clause on tabVT Task). Global scope reads every Task node; led scope
    unions each led project's Task descendants (a task belongs to a project via
    the nested set, not a `project` column), de-duplicated by node name."""
    filters = dict(extra_filters or {})
    if scope != "led":
        filters["node_type"] = TASK_NODE_TYPE
        return frappe.get_all(ITEM_DOCTYPE, filters=filters, fields=fields,
            limit_page_length=0)
    by_name: dict[str, dict] = {}
    for project_id in (led_ids or set()):
        for r in tree.descendants(project_id, TASK_NODE_TYPE,
                filters=dict(extra_filters or {}), fields=fields):
            by_name[r["name"]] = r
    return list(by_name.values())


@frappe.whitelist()
def team_tab_state() -> dict[str, Any]:
    """Cheap probe driving Tim-tab visibility in vt-home. Never throws for a
    logged-in user: returns visible=False for someone who neither manages nor
    leads any project. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    if _is_admin() or MANAGER_ROLE in frappe.get_roles(user):
        return {"visible": True, "scope": "global", "led_count": 0}
    led, _member = _user_project_ids(user)
    if led:
        return {"visible": True, "scope": "led", "led_count": len(led)}
    return {"visible": False, "scope": None, "led_count": 0}


def _team_stats(scope: str, led_ids: set[str] | None) -> dict[str, Any]:
    """Pending-review count, first-try approval rate %, and points earned this
    month, restricted to `scope`. approval_rate = CLOSED-this-month with
    revision_count=0 over all CLOSED-this-month."""
    ref = getdate(today())

    pending_review = len(_scoped_task_rows(
        scope, led_ids, ["name"],
        {"kanban_status": IN_REVIEW_STATUS, "pdca_phase": CHECK_PHASE},
    ))

    done_rows = _scoped_task_rows(
        scope, led_ids, ["name", "completion_date", "revision_count", "earned_points"],
        {"pdca_phase": DONE_PHASE},
    )
    month_done = approved = 0
    team_points = 0.0
    for r in done_rows:
        cd = r.get("completion_date")
        if not cd:
            continue
        cd = getdate(cd)
        if cd.year == ref.year and cd.month == ref.month:
            month_done += 1
            if int(r.get("revision_count") or 0) == 0:
                approved += 1
            team_points += float(r.get("earned_points") or 0)

    rate = round(approved / month_done * 100, 1) if month_done > 0 else 0.0
    return {
        "pending_review": int(pending_review),
        "approval_rate": float(rate),
        "team_points_month": float(team_points),
    }


def _team_phase_distribution(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Task counts grouped by PDCA phase (BACKLOG→CLOSED order), restricted to
    scope. Was GROUP BY pdca_phase + FIELD() ordering on tabVT Task."""
    rows = _scoped_task_rows(scope, led_ids, ["name", "pdca_phase"])
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r.get("pdca_phase")] += 1
    out: list[dict[str, Any]] = []
    for phase in _PHASE_ORDER:
        if phase in counts:
            out.append({"phase": phase, "count": int(counts[phase])})
    # Defensive: surface any unexpected phase value not in the canonical order.
    for phase, count in counts.items():
        if phase not in _PHASE_ORDER:
            out.append({"phase": phase, "count": int(count)})
    return out


def _team_leaderboard(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Top members by points earned this month, restricted to scope. Was
    GROUP BY assigned_to (→ owner_user) on tabVT Task; aggregated in Python."""
    ref = getdate(today())
    rows = _scoped_task_rows(
        scope, led_ids, ["name", OWNER_FIELD, "completion_date", "earned_points"],
        {"pdca_phase": DONE_PHASE},
    )
    points_by_member: dict[str, float] = defaultdict(float)
    for r in rows:
        cd = r.get("completion_date")
        if not cd:
            continue
        cd = getdate(cd)
        if cd.year == ref.year and cd.month == ref.month:
            points_by_member[r.get(OWNER_FIELD)] += float(r.get("earned_points") or 0)
    ranked = sorted(points_by_member.items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"member": member, "points": float(points)}
        for member, points in ranked[:LEADERBOARD_LIMIT]
    ]


def _team_overdue(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Open (non-CLOSED/ACT) tasks past deadline, most-overdue first,
    scope-restricted. assigned_to → owner_user; was a tabVT Task scan."""
    ref = getdate(today())
    rows = _scoped_task_rows(
        scope, led_ids,
        ["name", "title", OWNER_FIELD, "deadline", "pdca_phase"],
        {"pdca_phase": ["not in", CLOSED_PHASES], "deadline": ["<", today()]},
    )
    out = []
    for r in rows:
        deadline = r.get("deadline")
        if not deadline:
            continue
        days_overdue = (ref - getdate(deadline)).days
        out.append({
            "task_name": r["name"],
            "task_title": r.get("title"),
            "member": r.get(OWNER_FIELD),
            "deadline": str(deadline),
            "phase": r.get("pdca_phase"),
            "days_overdue": int(days_overdue),
        })
    out.sort(key=lambda x: x["days_overdue"], reverse=True)
    return out


@frappe.whitelist()
def team_overview() -> dict[str, Any]:
    """Aggregate leadership cockpit for the Tim tab: review/approval KPIs, PDCA
    phase mix, points leaderboard, and overdue tasks — scoped by
    _resolve_team_scope (led projects for leaders, global for managers/admins).
    Re-resolves scope server-side; never trusts a client hint. Folded + re-scoped
    from the deleted leader_dashboard page. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    scope, led_ids = _resolve_team_scope(user)
    return {
        "scope": scope,
        "stats": _team_stats(scope, led_ids),
        "phase_distribution": _team_phase_distribution(scope, led_ids),
        "leaderboard": _team_leaderboard(scope, led_ids),
        "overdue": _team_overdue(scope, led_ids),
    }
