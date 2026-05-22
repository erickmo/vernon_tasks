import frappe
from frappe.utils import today, add_days

_DONE_PHASE = "DONE"


@frappe.whitelist()
def get_employee_stats() -> dict:
    user = frappe.session.user

    done_today = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = %(done)s
          AND completion_date = %(today)s
    """, {"user": user, "done": _DONE_PHASE, "today": today()}, as_list=True)[0][0]

    done_week = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = %(done)s
          AND YEARWEEK(completion_date, 1) = YEARWEEK(%(today)s, 1)
    """, {"user": user, "done": _DONE_PHASE, "today": today()}, as_list=True)[0][0]

    points_month = frappe.db.sql("""
        SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = %(done)s
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"user": user, "done": _DONE_PHASE, "today": today()}, as_list=True)[0][0]

    blocked = frappe.db.sql("""
        SELECT COUNT(DISTINCT t.name) FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.assigned_to = %(user)s
          AND t.pdca_phase NOT IN ('DONE', 'ACT')
          AND bt.pdca_phase NOT IN ('DONE', 'ACT')
    """, {"user": user}, as_list=True)[0][0]

    return {
        "done_today": int(done_today),
        "done_week": int(done_week),
        "points_month": float(points_month),
        "blocked": int(blocked),
    }


@frappe.whitelist()
def get_daily_completions() -> list:
    user = frappe.session.user
    days = 7
    start = add_days(today(), -(days - 1))

    rows = frappe.db.sql("""
        SELECT completion_date AS date, COUNT(*) AS count
        FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = %(done)s
          AND completion_date >= %(start)s
          AND completion_date <= %(today)s
        GROUP BY completion_date
    """, {"user": user, "done": _DONE_PHASE, "start": start, "today": today()}, as_dict=True)

    counts_by_date = {str(r["date"]): r["count"] for r in rows}
    result = []
    for i in range(days):
        d = str(add_days(today(), -(days - 1 - i)))
        result.append({"date": d, "count": int(counts_by_date.get(d, 0))})
    return result


@frappe.whitelist()
def get_hours_summary() -> dict:
    user = frappe.session.user

    row = frappe.db.sql("""
        SELECT
            COALESCE(SUM(actual_hours), 0) AS actual_hours,
            COALESCE(SUM(estimated_hours), 0) AS estimated_hours
        FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase NOT IN ('DONE', 'ACT')
    """, {"user": user}, as_dict=True)

    return {
        "actual_hours": float(row[0]["actual_hours"]),
        "estimated_hours": float(row[0]["estimated_hours"]),
    }


_ACTIVE_SPRINT_STATUSES = ("Active", "In Progress", "Started")
_KANBAN_COLUMNS = ("Backlog", "Doing", "Review", "Done")


@frappe.whitelist()
def get_sprint_kanban() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    sprint = frappe.db.get_value(
        "VT Sprint",
        {"status": ["in", _ACTIVE_SPRINT_STATUSES]},
        ["name", "sprint_title", "start_date", "end_date"],
        as_dict=True,
    )
    if not sprint:
        return {"sprint": None, "columns": {c: [] for c in _KANBAN_COLUMNS}}

    rows = frappe.get_all(
        "VT Task",
        filters={
            "sprint": sprint["name"],
            "assigned_to": user,
            "kanban_status": ["!=", "Cancelled"],
        },
        fields=[
            "name",
            "title",
            "kanban_status",
            "base_points",
            "priority",
            "deadline",
        ],
        order_by="kanban_status asc, deadline asc",
        limit_page_length=200,
    )

    columns: dict = {c: [] for c in _KANBAN_COLUMNS}
    for r in rows:
        col = r.get("kanban_status") or "Backlog"
        if col not in columns:
            columns[col] = []
        columns[col].append({
            "id": r["name"],
            "title": r["title"],
            "points": float(r.get("base_points") or 0),
            "priority": r.get("priority"),
            "deadline": str(r["deadline"]) if r.get("deadline") else None,
        })

    total = sum(len(v) for v in columns.values())
    done_count = len(columns.get("Done", []))
    progress_pct = round(100 * done_count / total) if total else 0

    return {
        "sprint": {**sprint, "title": sprint.get("sprint_title"), "progress_pct": progress_pct},
        "columns": columns,
    }
