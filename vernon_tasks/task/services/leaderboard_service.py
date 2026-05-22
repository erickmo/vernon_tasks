import frappe
from frappe.utils import getdate, today, add_days, get_first_day, get_last_day

_VALID_PERIODS = ("week", "month", "quarter")
_DONE_PHASE = "DONE"


def period_window(period: str):
    if period not in _VALID_PERIODS:
        raise ValueError(f"Invalid period: {period}")
    t = getdate(today())
    if period == "week":
        start = add_days(t, -t.weekday())
        end = add_days(start, 6)
    elif period == "month":
        start = get_first_day(t)
        end = get_last_day(t)
    else:
        q = (t.month - 1) // 3
        start = getdate(f"{t.year}-{q*3+1:02d}-01")
        end = get_last_day(getdate(f"{t.year}-{q*3+3:02d}-01"))
    return start, end


def get_leaderboard(period: str, limit: int = 10, project_filter: list | None = None) -> list[dict]:
    start, end = period_window(period)
    params = {"done": _DONE_PHASE, "start": start, "end": end, "limit": limit}
    project_clause = ""
    if project_filter:
        params["projects"] = tuple(project_filter)
        project_clause = "AND project IN %(projects)s"
    rows = frappe.db.sql(f"""
        SELECT
            assigned_to AS user,
            COALESCE(SUM(earned_points), 0) AS points,
            COUNT(*) AS task_count
        FROM `tabVT Task`
        WHERE pdca_phase = %(done)s
          AND completion_date BETWEEN %(start)s AND %(end)s
          AND assigned_to IS NOT NULL
          AND assigned_to != ''
          {project_clause}
        GROUP BY assigned_to
        ORDER BY points DESC, task_count DESC
        LIMIT %(limit)s
    """, params, as_dict=True)
    return [{
        "user": r["user"],
        "points": float(r["points"]),
        "task_count": int(r["task_count"]),
    } for r in rows]
