import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def get_streak(user: str, project: str) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
    """, {"project": project, "closed": _CLOSED_STATUS}, as_dict=True)

    streak = 0
    for s in sprints:
        row = frappe.db.sql("""
            SELECT COALESCE(SUM(actual_minutes), 0) AS hrs
            FROM `tabVT Task`
            WHERE sprint = %(sprint)s
              AND assigned_to = %(user)s
              AND pdca_phase = %(done)s
        """, {"sprint": s["name"], "user": user, "done": _DONE_PHASE}, as_dict=True)
        if float(row[0]["hrs"]) > 0:
            streak += 1
        else:
            break

    return {"streak": int(streak), "sprints_checked": len(sprints)}
