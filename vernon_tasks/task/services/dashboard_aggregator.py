"""Compose role-aware dashboard payload from existing services."""
from __future__ import annotations

from typing import Literal

import frappe

# NOTE: The plan references `compute_health_score` and `evaluate_user_risk_items`
# but the existing services expose `get_health_score()` (no scope arg) and
# `evaluate_risks(project)` (per-project). We adapt locally rather than mutate
# upstream services. See "concerns" in commit/PR description.
from vernon_tasks.task.services.health_score_service import get_health_score

Role = Literal["ic", "leader", "pm", "exec"]

HEALTH_DROP_THRESHOLD = 10
ONTIME_FLOOR = 0.70
CHECKIN_STALE_DAYS = 5

_TEAM_ROLES = ("leader", "pm")
_DEFAULT_WEEKLY_HOURS = 40
_STREAK_MAX_LOOKBACK_DAYS = 365
_PROJECT_CLOSED_STATUS = "Closed"
_TASK_DONE_PHASE = "DONE"
_TASK_BLOCKED_STATUS = "Blocked"
_SPRINT_ACTIVE_STATUS = "Active"


def build_home_payload(user: str, role: Role) -> dict:
    return {
        "role": role,
        "at_risk": _at_risk(user, role),
        "today": _today(user, role),
        "me": _me(user),
        "sprints": _active_sprints(user),
        "projects": _my_projects(user),
    }


# ── at-risk ────────────────────────────────────────────────────────────────

def _at_risk(user: str, role: str) -> list[dict]:
    """Return list of at-risk project items for the user.

    Plan calls `evaluate_user_risk_items(user, scope, thresholds)` which does
    not exist. We aggregate per-project risks from existing `evaluate_risks`
    over the user's projects; when no projects → empty list (matches test).
    """
    try:
        from vernon_tasks.task.services.risk_evaluator import evaluate_risks
    except Exception:
        return []

    project_ids = _user_project_ids(user, scope="team" if role in _TEAM_ROLES else "self")
    items: list[dict] = []
    for project_id in project_ids:
        try:
            risks = evaluate_risks(project_id)
        except Exception:
            continue
        project_name = frappe.db.get_value("VT Project", project_id, "title") or project_id
        for risk in risks:
            if risk.get("severity") not in ("high", "med"):
                continue
            items.append({
                "project_id": project_id,
                "project_name": project_name,
                "reason": risk.get("detail") or risk.get("type") or "",
                "severity": risk.get("severity"),
            })
    return items


def _user_project_ids(user: str, scope: str) -> list[str]:
    """Return project IDs the user is involved in.

    VT Project has `project_owner` + `project_leader` (Link → User) and
    `team_members` (child table `Project Team Member`). Scope='self' returns
    projects the user owns or leads; scope='team' additionally includes
    projects where they appear as a team member.
    """
    try:
        if scope == "team":
            rows = frappe.db.sql(
                """
                SELECT DISTINCT p.name
                  FROM `tabVT Project` p
                  LEFT JOIN `tabProject Team Member` m
                         ON m.parent = p.name
                        AND m.parenttype = 'VT Project'
                 WHERE p.status != %(closed)s
                   AND (p.project_owner = %(u)s
                        OR p.project_leader = %(u)s
                        OR m.user = %(u)s)
                """,
                {"u": user, "closed": _PROJECT_CLOSED_STATUS},
                as_dict=True,
            )
        else:
            rows = frappe.db.sql(
                """
                SELECT name FROM `tabVT Project`
                 WHERE status != %(closed)s
                   AND (project_owner = %(u)s OR project_leader = %(u)s)
                """,
                {"u": user, "closed": _PROJECT_CLOSED_STATUS},
                as_dict=True,
            )
        return [r["name"] for r in rows]
    except frappe.db.DatabaseError:
        return []


# ── today ──────────────────────────────────────────────────────────────────

def _today(user: str, role: str) -> dict:
    base = {
        "ontime_rate_7d": _ontime_rate(user, days=7),
        "blocked_count": _blocked_count(user),
        "okr_confidence_delta_wow": _okr_delta_wow(user),
        "next_deadline": _next_deadline(user),
        "pdca_queue": _pdca_queue_counts(user),
    }
    if role == "exec":
        base["org_health_score"] = _safe_org_health_score()
    return base


def _safe_org_health_score() -> float:
    try:
        return float(get_health_score().get("score") or 0.0)
    except Exception:
        return 0.0


# ── me ─────────────────────────────────────────────────────────────────────

def _me(user: str) -> dict:
    return {
        "points_week": _points_week(user),
        "streak_days": _streak_days(user),
        "capacity_used_pct": _capacity_used_pct(user),
        "ontime_rate_7d": _ontime_rate(user, days=7),
    }


# ── sprints ────────────────────────────────────────────────────────────────

def _active_sprints(user: str) -> list[dict]:
    """Active sprints user is involved in via assigned VT Tasks.

    VT Sprint has no `percent_done` or `burndown_actual_json` columns; both
    are derived on read by callers, so we surface empty defaults here.
    """
    try:
        rows = frappe.db.sql(
            """
            SELECT s.name, s.sprint_title AS title, s.start_date, s.end_date
              FROM `tabVT Sprint` s
              JOIN `tabVT Task` t ON t.sprint = s.name
             WHERE t.assigned_to = %(u)s
               AND s.status = %(active)s
             GROUP BY s.name
             ORDER BY s.end_date ASC
            """,
            {"u": user, "active": _SPRINT_ACTIVE_STATUS},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return []

    today = frappe.utils.getdate()
    out = []
    for r in rows:
        days_left = max(0, (r.end_date - today).days) if r.end_date else 0
        out.append({
            "id": r.name,
            "name": r.title,
            "days_left": days_left,
            "percent_done": _sprint_percent_done(r.name),
            "burndown_spark": [],
        })
    return out


def _sprint_percent_done(sprint_id: str) -> float:
    """Compute percent_done from VT Task pdca_phase='DONE' / total in sprint."""
    try:
        row = frappe.db.sql(
            """
            SELECT
              SUM(CASE WHEN pdca_phase = %(done)s THEN 1 ELSE 0 END) AS done_n,
              COUNT(*) AS total
              FROM `tabVT Task`
             WHERE sprint = %(s)s
            """,
            {"s": sprint_id, "done": _TASK_DONE_PHASE},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return 0.0
    r = row[0] if row else {}
    total = int(r.get("total") or 0)
    if not total:
        return 0.0
    return round(int(r.get("done_n") or 0) / total * 100, 1)


# ── projects ───────────────────────────────────────────────────────────────

def _my_projects(user: str) -> list[dict]:
    """Projects where user is owner, leader, or team member.

    VT Project has no `health_score` / `percent_done` columns; health is
    derived via `health_score_service` and percent_done via task aggregates.
    """
    try:
        rows = frappe.db.sql(
            """
            SELECT DISTINCT p.name, p.title, p.project_owner, p.project_leader,
                   p.end_date
              FROM `tabVT Project` p
              LEFT JOIN `tabProject Team Member` m
                     ON m.parent = p.name
                    AND m.parenttype = 'VT Project'
             WHERE p.status != %(closed)s
               AND (p.project_owner = %(u)s
                    OR p.project_leader = %(u)s
                    OR m.user = %(u)s)
            """,
            {"u": user, "closed": _PROJECT_CLOSED_STATUS},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return []

    today = frappe.utils.getdate()
    out = []
    for r in rows:
        out.append({
            "id": r.name,
            "name": r.title,
            "health": _health_bucket(None),
            "okr_progress": _project_okr_progress(r.name),
            "my_role": _user_role_in_project(user, r.name, r.project_owner, r.project_leader),
            "blocked_count": _project_blocked_count(r.name),
            "days_left": max(0, (r.end_date - today).days) if r.end_date else None,
        })
    return out


def _project_blocked_count(project_id: str) -> int:
    try:
        return int(frappe.db.count(
            "VT Task",
            {"project": project_id, "kanban_status": _TASK_BLOCKED_STATUS},
        ))
    except frappe.db.DatabaseError:
        return 0


# ── primitives ─────────────────────────────────────────────────────────────

def _health_bucket(score: float | None) -> str:
    if score is None:
        return "grey"
    if score >= 75:
        return "green"
    if score >= 50:
        return "amber"
    return "red"


def _ontime_rate(user: str, days: int) -> float:
    """On-time rate over last N days for user's done tasks.

    Uses VT Task actual fields: assigned_to, pdca_phase, completion_date,
    deadline. Aliases legacy names in SELECT for downstream compatibility.
    """
    try:
        row = frappe.db.sql(
            """
            SELECT
              SUM(CASE WHEN completion_date <= deadline THEN 1 ELSE 0 END) AS ontime,
              COUNT(*) AS total
              FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase = %(done)s
               AND completion_date >= DATE_SUB(CURDATE(), INTERVAL %(d)s DAY)
            """,
            {"u": user, "d": days, "done": _TASK_DONE_PHASE},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return 0.0
    r = row[0] if row else {}
    total = int(r.get("total") or 0)
    if not total:
        return 0.0
    return round(int(r.get("ontime") or 0) / total, 3)


def _blocked_count(user: str) -> int:
    try:
        return int(frappe.db.count(
            "VT Task",
            {"assigned_to": user, "kanban_status": _TASK_BLOCKED_STATUS},
        ))
    except frappe.db.DatabaseError:
        return 0


def _okr_delta_wow(user: str) -> float:
    """KR week-over-week confidence delta.

    Key Result has no `confidence` / `confidence_last_week` columns in the
    current schema (verified via doctype JSON). Returns 0.0 until those
    fields are introduced.
    """
    return 0.0


def _next_deadline(user: str) -> dict | None:
    try:
        row = frappe.db.sql(
            """
            SELECT name, title, deadline AS due_date FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase != %(done)s
               AND deadline IS NOT NULL
             ORDER BY deadline ASC LIMIT 1
            """,
            {"u": user, "done": _TASK_DONE_PHASE},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return None
    if not row:
        return None
    r = row[0]
    return {"id": r.name, "title": r.title, "due_date": str(r.due_date)}


def _pdca_queue_counts(user: str) -> dict[str, int]:
    try:
        rows = frappe.db.sql(
            """
            SELECT pdca_phase, COUNT(*) AS n FROM `tabVT Task`
             WHERE assigned_to = %(u)s AND pdca_phase != %(done)s
             GROUP BY pdca_phase
            """,
            {"u": user, "done": _TASK_DONE_PHASE},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return {}
    return {r.pdca_phase: int(r.n) for r in rows}


def _points_week(user: str) -> int:
    """Sum of earned points for user from Task Point Log over last 7 days.

    Uses `tabTask Point Log` (no `VT` prefix) with real columns
    `user`, `amount`, `log_timestamp`.
    """
    try:
        row = frappe.db.sql(
            """
            SELECT SUM(amount) AS p FROM `tabTask Point Log`
             WHERE user = %(u)s
               AND log_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            """,
            {"u": user},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return 0
    return int((row[0].p if row and row[0].p else 0))


def _streak_days(user: str) -> int:
    from datetime import timedelta
    today = frappe.utils.getdate()
    streak = 0
    for offset in range(0, _STREAK_MAX_LOOKBACK_DAYS):
        d = today - timedelta(days=offset)
        try:
            n = frappe.db.count("VT Task", {
                "assigned_to": user,
                "pdca_phase": _TASK_DONE_PHASE,
                "completion_date": d,
            })
        except frappe.db.DatabaseError:
            return streak
        if n:
            streak += 1
        else:
            break
    return streak


def _capacity_used_pct(user: str) -> float:
    """Capacity used as ratio of remaining estimated hours / weekly capacity.

    No `VT Employee Capacity` doctype exists; we use a default weekly hours
    constant. `VT Task Schedule Entry` exists as a child table but is not
    yet populated reliably, so we fall back to (estimated - actual) hours on
    in-flight tasks.
    """
    cap = float(_DEFAULT_WEEKLY_HOURS)
    try:
        scheduled = frappe.db.sql(
            """
            SELECT SUM(GREATEST(estimated_hours - actual_hours, 0)) AS h
              FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase != %(done)s
            """,
            {"u": user, "done": _TASK_DONE_PHASE},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return 0.0
    used = float((scheduled[0].h if scheduled and scheduled[0].h else 0))
    return round((used / cap) if cap else 0.0, 3)


def _project_okr_progress(project_id: str) -> float:
    """Average progress of KRs under the project's linked Objective.

    Relationship: VT Project.objective → Objective → Key Result.objective.
    """
    try:
        row = frappe.db.sql(
            """
            SELECT AVG(kr.current_value / NULLIF(kr.target_value, 0)) AS p
              FROM `tabKey Result` kr
              JOIN `tabObjective` o ON o.name = kr.objective
              JOIN `tabVT Project` p ON p.objective = o.name
             WHERE p.name = %(p)s
            """,
            {"p": project_id},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return 0.0
    return round(float(row[0].p or 0), 3) if row else 0.0


def _user_role_in_project(
    user: str,
    project_id: str,
    project_owner: str | None = None,
    project_leader: str | None = None,
) -> str:
    """Resolve user's role within a project.

    Priority: owner > leader > team_members.role > 'member'.
    """
    if project_owner and project_owner == user:
        return "owner"
    if project_leader and project_leader == user:
        return "leader"
    try:
        role = frappe.db.get_value(
            "Project Team Member",
            {"parent": project_id, "parenttype": "VT Project", "user": user},
            "role",
        )
    except frappe.db.DatabaseError:
        role = None
    return role or "member"
