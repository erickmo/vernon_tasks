import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def get_sprint_velocity(sprint: str) -> float:
    row = frappe.db.sql("""
        SELECT COALESCE(SUM(actual_hours), 0) AS hours
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
    """, {"sprint": sprint, "done": _DONE_PHASE}, as_dict=True)
    return float(row[0]["hours"])


def get_velocity_trend(project: str, n: int = 6) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
        LIMIT %(n)s
    """, {"project": project, "closed": _CLOSED_STATUS, "n": n}, as_dict=True)

    sprint_names = [s["name"] for s in reversed(sprints)]
    velocities = [get_sprint_velocity(name) for name in sprint_names]

    avg = sum(velocities) / len(velocities) if velocities else 0.0
    if len(velocities) >= 2 and velocities[0] > 0:
        trend_pct = (velocities[-1] - velocities[0]) / velocities[0] * 100
    else:
        trend_pct = 0.0

    return {
        "sprints": sprint_names,
        "velocity": velocities,
        "avg": float(avg),
        "trend_pct": float(trend_pct),
    }
