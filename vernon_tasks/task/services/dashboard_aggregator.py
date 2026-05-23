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
    """Return project IDs the user is involved in. Empty if doctype absent."""
    try:
        rows = frappe.db.sql(
            """
            SELECT name FROM `tabVT Project`
             WHERE status != 'Done' AND project_lead = %(u)s
            """,
            {"u": user},
            as_dict=True,
        )
        return [r["name"] for r in rows]
    except Exception:
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
    """Active sprints user is involved in.

    Plan joins `tabVT Sprint Task` (which doesn't exist). We fall back to
    sprints owned via VT Task.assigned_to.
    """
    try:
        rows = frappe.db.sql(
            """
            SELECT s.name, s.title, s.start_date, s.end_date,
                   s.percent_done, s.burndown_actual_json
              FROM `tabVT Sprint` s
              JOIN `tabVT Task` t ON t.sprint = s.name
             WHERE t.assigned_to = %(u)s
               AND s.status = 'Active'
             GROUP BY s.name
             ORDER BY s.end_date ASC
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return []

    today = frappe.utils.getdate()
    out = []
    for r in rows:
        days_left = max(0, (r.end_date - today).days) if r.end_date else 0
        try:
            spark = frappe.parse_json(r.burndown_actual_json or "[]")
        except Exception:
            spark = []
        out.append({
            "id": r.name,
            "name": r.title,
            "days_left": days_left,
            "percent_done": float(r.percent_done or 0),
            "burndown_spark": spark,
        })
    return out


# ── projects ───────────────────────────────────────────────────────────────

def _my_projects(user: str) -> list[dict]:
    """Plan joins `tabVT Project Member` (doesn't exist). Fall back to
    project_lead match.
    """
    try:
        rows = frappe.db.sql(
            """
            SELECT p.name, p.title, p.project_lead,
                   p.health_score, p.percent_done, p.end_date,
                   (SELECT COUNT(*) FROM `tabVT Task` t
                     WHERE t.project = p.name AND t.kanban_status = 'Blocked') AS blocked
              FROM `tabVT Project` p
             WHERE p.project_lead = %(u)s
               AND p.status != 'Done'
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return []

    today = frappe.utils.getdate()
    out = []
    for r in rows:
        out.append({
            "id": r.name,
            "name": r.title,
            "health": _health_bucket(r.health_score),
            "okr_progress": _project_okr_progress(r.name),
            "my_role": _user_role_in_project(user, r.name),
            "blocked_count": int(r.blocked or 0),
            "days_left": max(0, (r.end_date - today).days) if r.end_date else None,
        })
    return out


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
    """Use VT Task actual fields: assigned_to, pdca_phase='DONE',
    completion_date, deadline. (Plan used non-existent assignee/status/
    due_date/completed_on names.)
    """
    try:
        row = frappe.db.sql(
            """
            SELECT
              SUM(CASE WHEN completion_date <= deadline THEN 1 ELSE 0 END) AS ontime,
              COUNT(*) AS total
              FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase = 'DONE'
               AND completion_date >= DATE_SUB(CURDATE(), INTERVAL %(d)s DAY)
            """,
            {"u": user, "d": days},
            as_dict=True,
        )
    except Exception:
        return 0.0
    r = row[0] if row else {}
    total = int(r.get("total") or 0)
    if not total:
        return 0.0
    return round(int(r.get("ontime") or 0) / total, 3)


def _blocked_count(user: str) -> int:
    try:
        return int(frappe.db.count("VT Task", {"assigned_to": user, "kanban_status": "Blocked"}))
    except Exception:
        return 0


def _okr_delta_wow(user: str) -> float:
    """Plan references `tabVT Key Result` (doesn't exist). Returns 0.0 when
    table is absent.
    """
    try:
        rows = frappe.db.sql(
            """
            SELECT confidence, confidence_last_week
              FROM `tabVT Key Result`
             WHERE owner_user = %(u)s
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return 0.0
    if not rows:
        return 0.0
    deltas = [
        (float(r.confidence or 0) - float(r.confidence_last_week or 0))
        for r in rows
    ]
    return round(sum(deltas) / len(deltas), 3)


def _next_deadline(user: str) -> dict | None:
    try:
        row = frappe.db.sql(
            """
            SELECT name, title, deadline FROM `tabVT Task`
             WHERE assigned_to = %(u)s AND pdca_phase != 'DONE' AND deadline IS NOT NULL
             ORDER BY deadline ASC LIMIT 1
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return None
    if not row:
        return None
    r = row[0]
    return {"id": r.name, "title": r.title, "due_date": str(r.deadline)}


def _pdca_queue_counts(user: str) -> dict[str, int]:
    try:
        rows = frappe.db.sql(
            """
            SELECT pdca_phase, COUNT(*) AS n FROM `tabVT Task`
             WHERE assigned_to = %(u)s AND pdca_phase != 'DONE'
             GROUP BY pdca_phase
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return {}
    return {r.pdca_phase: int(r.n) for r in rows}


def _points_week(user: str) -> int:
    """Plan references `tabVT Task Point Log` (doesn't exist). Falls back to
    earned_points sum from VT Task.
    """
    try:
        row = frappe.db.sql(
            """
            SELECT SUM(earned_points) AS p FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase = 'DONE'
               AND completion_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
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
                "assigned_to": user, "pdca_phase": "DONE", "completion_date": d,
            })
        except Exception:
            return streak
        if n:
            streak += 1
        else:
            break
    return streak


def _capacity_used_pct(user: str) -> float:
    """Plan references `tabVT Employee Capacity` and `tabVT Task Schedule Entry`
    (don't exist). Falls back to estimated_hours on the user's in-flight tasks
    against a default weekly capacity.
    """
    try:
        cap = frappe.db.get_value(
            "VT Employee Capacity", {"employee": user}, "weekly_hours"
        )
    except Exception:
        cap = None
    cap = float(cap or _DEFAULT_WEEKLY_HOURS)

    try:
        scheduled = frappe.db.sql(
            """
            SELECT SUM(GREATEST(estimated_hours - actual_hours, 0)) AS h
              FROM `tabVT Task`
             WHERE assigned_to = %(u)s
               AND pdca_phase != 'DONE'
            """,
            {"u": user},
            as_dict=True,
        )
    except Exception:
        return 0.0
    used = float((scheduled[0].h if scheduled and scheduled[0].h else 0))
    return round((used / cap) if cap else 0.0, 3)


def _project_okr_progress(project_id: str) -> float:
    try:
        row = frappe.db.sql(
            """
            SELECT AVG(kr.current_value / NULLIF(kr.target_value, 0)) AS p
              FROM `tabVT Key Result` kr
              JOIN `tabVT Objective` o ON o.name = kr.objective
             WHERE o.linked_project = %(p)s
            """,
            {"p": project_id},
            as_dict=True,
        )
    except Exception:
        return 0.0
    return round(float(row[0].p or 0), 3) if row else 0.0


def _user_role_in_project(user: str, project_id: str) -> str:
    try:
        role = frappe.db.get_value(
            "VT Project Member", {"parent": project_id, "user": user}, "role"
        )
    except Exception:
        role = None
    return role or "member"
