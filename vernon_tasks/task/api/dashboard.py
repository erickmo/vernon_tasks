"""Mobile mix-view dashboard API.

Spec: docs/superpowers/specs/2026-05-22-dashboard-mix-view-design.html
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any

import frappe
from frappe.utils import add_days, getdate, today

from vernon_tasks.task.api.security import require_login
from vernon_tasks.task.doctype.vt_task.vt_task import (
    BOARD_COLUMNS,
    KANBAN_BLOCKED,
    KANBAN_PDCA_MAP,
    PDCA_KANBAN_MAP,
    VALID_PDCA_TRANSITIONS,
)

TASK_DOCTYPE = "VT Task"
PROJECT_DOCTYPE = "VT Project"
SPRINT_DOCTYPE = "VT Sprint"

# Card field set shared by the detail open-task list and the project board.
_BOARD_TASK_FIELDS = (
    "name", "title", "kanban_status", "pdca_phase",
    "priority", "start_date", "deadline", "risk_flag", "assigned_to",
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
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "=", "Done"],
            ["completion_date", ">=", window_start],
        ],
        fields=["completion_date"],
        limit_page_length=0,
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
    sprints = frappe.get_all(
        SPRINT_DOCTYPE,
        filters=[
            ["status", "=", "Active"],
            ["start_date", "<=", ref],
            ["end_date", ">=", ref],
        ],
        fields=["name", "sprint_title", "project", "start_date", "end_date"],
        order_by="end_date asc",
        limit_page_length=20,
    )
    for s in sprints:
        task_count = frappe.db.count(
            TASK_DOCTYPE,
            filters={"sprint": s["name"], "assigned_to": user},
        )
        if task_count > 0:
            return s
    return None


def _sprint_summary(sprint: dict, user: str, ref: datetime.date) -> dict:
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters={"sprint": sprint["name"], "assigned_to": user},
        fields=["base_points", "kanban_status"],
        limit_page_length=0,
    )
    committed = sum(int(r.get("base_points") or 0) for r in rows)
    done = sum(
        int(r.get("base_points") or 0)
        for r in rows
        if r.get("kanban_status") == "Done"
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
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "not in", ("Done", "Cancelled")],
        ],
        fields=["deadline"],
        limit_page_length=0,
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
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "not in", ("Done", "Cancelled")],
        ],
        fields=["name", "title", "project", "deadline", "priority"],
        limit_page_length=200,
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
            "project": r.get("project"),
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
    led_rows = frappe.get_all(
        PROJECT_DOCTYPE,
        filters=[["project_leader", "=", user]],
        fields=["name"],
        limit_page_length=0,
    )
    led = {r["name"] for r in led_rows}

    member_rows = frappe.db.sql(
        """
        SELECT DISTINCT parent FROM `tabProject Team Member`
        WHERE user = %s AND parenttype = %s
        """,
        (user, PROJECT_DOCTYPE),
        as_dict=True,
    )
    member = {r["parent"] for r in member_rows} - led
    return led, member


def _project_active_sprint(project_id: str, ref: datetime.date) -> dict | None:
    rows = frappe.get_all(
        SPRINT_DOCTYPE,
        filters=[
            ["project", "=", project_id],
            ["status", "=", "Active"],
            ["start_date", "<=", ref],
            ["end_date", ">=", ref],
        ],
        fields=["name", "sprint_title", "start_date", "end_date"],
        order_by="end_date asc",
        limit_page_length=1,
    )
    return rows[0] if rows else None


def _burndown(sprint: dict, ref: datetime.date) -> tuple[list[float], list[float]]:
    start = getdate(sprint["start_date"])
    end = getdate(sprint["end_date"])
    days = max(1, (end - start).days)
    total_points = sum(
        int(r.get("base_points") or 0)
        for r in frappe.get_all(
            TASK_DOCTYPE,
            filters={"sprint": sprint["name"]},
            fields=["base_points"],
            limit_page_length=0,
        )
    )
    horizon = min(7, days + 1)
    ideal = [
        round(total_points * (1 - i / days), 1)
        for i in range(horizon)
    ]
    done_by_day = defaultdict(int)
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["sprint", "=", sprint["name"]],
            ["kanban_status", "=", "Done"],
            ["completion_date", "is", "set"],
        ],
        fields=["completion_date", "base_points"],
        limit_page_length=0,
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
    proj = frappe.get_value(
        PROJECT_DOCTYPE,
        project_id,
        ["title", "status", "percent_done"],
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

    task_rows = frappe.get_all(
        TASK_DOCTYPE,
        filters={"project": project_id},
        fields=["kanban_status", "risk_flag", "deadline"],
        limit_page_length=0,
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
        committed = sum(int(r.get("base_points") or 0)
                        for r in frappe.get_all(TASK_DOCTYPE,
                                                filters={"sprint": sprint["name"]},
                                                fields=["base_points"],
                                                limit_page_length=0))
        done = sum(int(r.get("base_points") or 0)
                   for r in frappe.get_all(TASK_DOCTYPE,
                                           filters={"sprint": sprint["name"], "kanban_status": "Done"},
                                           fields=["base_points"],
                                           limit_page_length=0))
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
    milestones = frappe.get_all(
        "Project Milestone",
        filters=[
            ["parent", "=", project_id],
            ["status", "!=", "Done"],
        ],
        fields=["due_date"],
        order_by="due_date asc",
        limit_page_length=1,
    )
    next_ms = str(milestones[0]["due_date"]) if milestones and milestones[0].get("due_date") else None
    my_open = frappe.db.count(
        TASK_DOCTYPE,
        filters=[
            ["project", "=", project_id],
            ["assigned_to", "=", user],
            ["kanban_status", "not in", ("Done", "Cancelled")],
        ],
    )
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
        all_rows = frappe.get_all(
            PROJECT_DOCTYPE,
            filters=[["status", "!=", "Archived"]],
            fields=["name"],
            limit_page_length=0,
        )
        led_ids = {r["name"] for r in all_rows}
        member_ids: set[str] = set()
        if filter == "led":
            led_rows = frappe.get_all(
                PROJECT_DOCTYPE,
                filters=[["project_leader", "=", user]],
                fields=["name"],
                limit_page_length=0,
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
    proj = frappe.get_value(
        PROJECT_DOCTYPE,
        project_id,
        ["title", "status", "pdca_phase", "percent_done",
         "project_leader", "start_date", "end_date"],
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


def _map_task_row(r: dict) -> dict:
    """Map a raw VT Task row to the card dict used by the detail list + board."""
    return {
        "id": r["name"],
        "title": r.get("title"),
        "kanban_status": r.get("kanban_status"),
        "pdca_phase": r.get("pdca_phase"),
        "priority": r.get("priority"),
        "start_date": str(r["start_date"]) if r.get("start_date") else None,
        "deadline": str(r["deadline"]) if r.get("deadline") else None,
        "risk_flag": bool(r.get("risk_flag")),
        "assigned_to": r.get("assigned_to"),
    }


def _project_tasks(project_id: str, *, include_closed: bool) -> list[dict]:
    """Fetch a project's task cards. Excludes closed statuses unless requested.

    Shared by `_detail_open_tasks` (open only) and `project_board` (all tasks)
    so the card shape and query stay in one place.
    """
    filters = [["project", "=", project_id]]
    if not include_closed:
        filters.append(["kanban_status", "not in", CLOSED_STATUSES])
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=filters,
        fields=list(_BOARD_TASK_FIELDS),
        order_by="deadline asc",
        limit_page_length=DETAIL_TASK_LIMIT,
    )
    return [_map_task_row(r) for r in rows]


def _detail_open_tasks(project_id: str) -> list[dict]:
    return _project_tasks(project_id, include_closed=False)


def _detail_counts(project_id: str) -> dict[str, int]:
    """Authoritative (uncapped) task tallies for the hero meta row.

    Uses ``frappe.db.count`` rather than the ``DETAIL_TASK_LIMIT``-capped open
    list so the numbers stay honest on projects with >200 tasks. ``open`` mirrors
    the board's CLOSED_STATUSES contract, so ``open + done`` may be < ``total``
    when there are Cancelled tasks (the remainder is intentionally not shown).
    """
    base = {"project": project_id}
    total = frappe.db.count(TASK_DOCTYPE, base)
    done = frappe.db.count(TASK_DOCTYPE, {**base, "kanban_status": DONE_STATUS})
    open_count = frappe.db.count(
        TASK_DOCTYPE, [["project", "=", project_id],
                       ["kanban_status", "not in", CLOSED_STATUSES]])
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
    if doc.project_leader:
        users.add(doc.project_leader)
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


# Sprint header fields surfaced on the project detail Sprint tab.
_SPRINT_FIELDS = (
    "name", "sprint_title", "start_date", "end_date",
    "status", "percent_done", "goal",
)


def _map_sprint_row(r: dict) -> dict:
    """Map a raw VT Sprint row to the sprint-card dict used by the Sprint tab."""
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
    sprints = frappe.get_all(
        SPRINT_DOCTYPE, filters={"project": project_id},
        fields=list(_SPRINT_FIELDS), order_by="start_date desc",
        limit_page_length=0,
    )
    by_id = {s["name"]: _map_sprint_row(s) for s in sprints}
    rows = frappe.get_all(
        TASK_DOCTYPE, filters=[["project", "=", project_id]],
        fields=list(_BOARD_TASK_FIELDS) + ["sprint"],
        order_by="deadline asc", limit_page_length=DETAIL_TASK_LIMIT,
    )
    unassigned: list[dict] = []
    for r in rows:
        bucket = by_id.get(r.get("sprint"))
        (bucket["tasks"] if bucket else unassigned).append(_map_task_row(r))
    return {"sprints": list(by_id.values()), "unassigned": unassigned}


# ── 3. schedule_agenda ───────────────────────────────────────────────────────


def _task_agenda_items(user: str, start: datetime.date, end: datetime.date) -> list[dict]:
    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "not in", ("Done", "Cancelled")],
            ["deadline", "between", [start, end]],
        ],
        fields=["name", "title", "project", "deadline", "priority"],
        limit_page_length=500,
    )
    return [
        {
            "type": "task",
            "id": r["name"],
            "title": r.get("title"),
            "project": r.get("project"),
            "date": str(r["deadline"]),
            "time": None,
            "priority": r.get("priority"),
            "route": f"/app/vt-task/{r['name']}",
        }
        for r in rows
    ]


def _sprint_agenda_items(user: str, start: datetime.date, end: datetime.date) -> list[dict]:
    user_sprints = frappe.db.sql(
        """
        SELECT DISTINCT t.sprint
        FROM `tabVT Task` t
        WHERE t.assigned_to = %s AND t.sprint IS NOT NULL AND t.sprint != ''
        """,
        (user,),
        as_dict=True,
    )
    sprint_ids = [r["sprint"] for r in user_sprints]
    if not sprint_ids:
        return []
    rows = frappe.get_all(
        SPRINT_DOCTYPE,
        filters=[["name", "in", sprint_ids]],
        fields=["name", "sprint_title", "project", "start_date", "end_date"],
        limit_page_length=200,
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

DONE_PHASE = "DONE"
# Phases that count as "finished" — excluded from active/blocked/overdue queries.
CLOSED_PHASES = ("DONE", "ACT")
DAILY_COMPLETION_DAYS = 7
MINUTES_PER_HOUR = 60.0


@frappe.whitelist()
def personal_stats() -> dict[str, Any]:
    """Headline counts for the Beranda tab: tasks done today / this ISO week,
    points earned this calendar month, and currently-blocked task count.
    Self-scoped. Migrated from my_dashboard.get_employee_stats. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    _today = today()

    done_today = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND completion_date = %(today)s""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    done_week = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND YEARWEEK(completion_date, 1) = YEARWEEK(%(today)s, 1)""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    points_month = frappe.db.sql(
        """SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND YEAR(completion_date) = YEAR(%(today)s)
             AND MONTH(completion_date) = MONTH(%(today)s)""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    blocked = frappe.db.sql(
        """SELECT COUNT(DISTINCT t.name) FROM `tabVT Task` t
           INNER JOIN `tabTask Dependency` td ON td.parent = t.name
           INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
           WHERE t.assigned_to = %(user)s
             AND t.pdca_phase NOT IN %(closed)s
             AND bt.pdca_phase NOT IN %(closed)s""",
        {"user": user, "closed": CLOSED_PHASES}, as_list=True,
    )[0][0]

    return {
        "done_today": int(done_today),
        "done_week": int(done_week),
        "points_month": float(points_month),
        "blocked": int(blocked),
    }


@frappe.whitelist()
def daily_completions() -> list[dict[str, Any]]:
    """Tasks the user completed on each of the last 7 days, zero-filled, oldest
    first — for the Beranda completions bar chart. Self-scoped. Migrated from
    my_dashboard.get_daily_completions. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    start = add_days(today(), -(DAILY_COMPLETION_DAYS - 1))

    rows = frappe.db.sql(
        """SELECT completion_date AS date, COUNT(*) AS count
           FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND completion_date >= %(start)s AND completion_date <= %(today)s
           GROUP BY completion_date""",
        {"user": user, "done": DONE_PHASE, "start": start, "today": today()},
        as_dict=True,
    )

    counts_by_date = {str(r["date"]): r["count"] for r in rows}
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

    row = frappe.db.sql(
        """SELECT COALESCE(SUM(actual_minutes), 0) AS actual_minutes,
                  COALESCE(SUM(estimated_minutes), 0) AS estimated_minutes
           FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase NOT IN %(closed)s""",
        {"user": user, "closed": CLOSED_PHASES}, as_dict=True,
    )

    actual = float(row[0]["actual_minutes"])
    estimated = float(row[0]["estimated_minutes"])
    remaining = max(0.0, estimated - actual)
    return {
        "logged_hours": round(actual / MINUTES_PER_HOUR, 1),
        "remaining_hours": round(remaining / MINUTES_PER_HOUR, 1),
    }
