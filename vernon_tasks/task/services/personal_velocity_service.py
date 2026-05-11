import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def _hours_in_sprint(sprint: str, user: str | None) -> float:
    where_user = "AND assigned_to = %(user)s" if user else ""
    row = frappe.db.sql(f"""
        SELECT COALESCE(SUM(actual_hours), 0) AS hrs
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
          {where_user}
    """, {"sprint": sprint, "done": _DONE_PHASE, "user": user}, as_dict=True)
    return float(row[0]["hrs"])


def _distinct_assignees(sprint: str) -> int:
    row = frappe.db.sql("""
        SELECT COUNT(DISTINCT assigned_to) AS n
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
          AND assigned_to IS NOT NULL
          AND assigned_to != ''
    """, {"sprint": sprint, "done": _DONE_PHASE}, as_dict=True)
    return int(row[0]["n"])


def get_personal_velocity(user: str, project: str, n: int = 6) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
        LIMIT %(n)s
    """, {"project": project, "closed": _CLOSED_STATUS, "n": n}, as_dict=True)

    sprint_names = [s["name"] for s in reversed(sprints)]
    personal = [_hours_in_sprint(name, user) for name in sprint_names]
    team_avg = []
    for name in sprint_names:
        total = _hours_in_sprint(name, None)
        assignees = _distinct_assignees(name)
        team_avg.append(round(total / assignees, 2) if assignees else 0.0)

    avg = sum(personal) / len(personal) if personal else 0.0
    team_avg_total = sum(team_avg) / len(team_avg) if team_avg else 0.0

    return {
        "sprints": sprint_names,
        "personal": personal,
        "team_avg": team_avg,
        "avg": float(avg),
        "team_avg_total": float(team_avg_total),
    }
