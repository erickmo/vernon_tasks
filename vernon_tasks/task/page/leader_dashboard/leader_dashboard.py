import frappe
from frappe.utils import today

_DONE_PHASE = "DONE"
_IN_REVIEW_STATUS = "In Review"
_CHECK_PHASE = "CHECK"
_ALLOWED_ROLES = ("VT Leader", "VT Manager")


@frappe.whitelist()
def get_leader_stats() -> dict:
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    _today = today()

    pending_review = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE kanban_status = %(in_review)s
          AND pdca_phase = %(check_phase)s
    """, {"in_review": _IN_REVIEW_STATUS, "check_phase": _CHECK_PHASE}, as_list=True)[0][0]

    month_done = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE pdca_phase = %(done_phase)s
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"done_phase": _DONE_PHASE, "today": _today}, as_list=True)[0][0]

    approved = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE pdca_phase = %(done_phase)s
          AND revision_count = 0
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"done_phase": _DONE_PHASE, "today": _today}, as_list=True)[0][0]

    # revision_count = 0 means approved on first try; > 0 means went through at least one rejection
    approval_rate = round((int(approved) / int(month_done) * 100), 1) if int(month_done) > 0 else 0.0

    team_points_month = frappe.db.sql("""
        SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
        WHERE pdca_phase = %(done_phase)s
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"done_phase": _DONE_PHASE, "today": _today}, as_list=True)[0][0]

    return {
        "pending_review": int(pending_review),
        "approval_rate": float(approval_rate),
        "team_points_month": float(team_points_month),
    }


@frappe.whitelist()
def get_phase_distribution() -> list:
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    rows = frappe.db.sql("""
        SELECT pdca_phase AS phase, COUNT(*) AS count
        FROM `tabVT Task`
        GROUP BY pdca_phase
        ORDER BY FIELD(pdca_phase, 'BACKLOG', 'PLAN', 'DO', 'CHECK', 'ACT', 'DONE')
    """, as_dict=True)
    return [{"phase": r["phase"], "count": int(r["count"])} for r in rows]


@frappe.whitelist()
def get_team_leaderboard() -> list:
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    rows = frappe.db.sql("""
        SELECT
            assigned_to AS member,
            COALESCE(SUM(earned_points), 0) AS points
        FROM `tabVT Task`
        WHERE pdca_phase = 'DONE'
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
        GROUP BY assigned_to
        ORDER BY points DESC
        LIMIT 10
    """, {"today": today()}, as_dict=True)
    return [{"member": r["member"], "points": float(r["points"])} for r in rows]


@frappe.whitelist()
def get_overdue_tasks() -> list:
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    rows = frappe.db.sql("""
        SELECT
            t.name AS task_name,
            t.title AS task_title,
            t.assigned_to AS member,
            t.deadline,
            t.pdca_phase AS phase,
            DATEDIFF(%(today)s, t.deadline) AS days_overdue
        FROM `tabVT Task` t
        WHERE t.deadline < %(today)s
          AND t.pdca_phase NOT IN ('DONE', 'ACT')
        ORDER BY days_overdue DESC
    """, {"today": today()}, as_dict=True)
    return [
        {
            "task_name": r["task_name"],
            "task_title": r["task_title"],
            "member": r["member"],
            "deadline": str(r["deadline"]),
            "phase": r["phase"],
            "days_overdue": int(r["days_overdue"]),
        }
        for r in rows
    ]
