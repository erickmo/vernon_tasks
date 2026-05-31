import frappe
from frappe.utils import add_days, getdate


def get_burndown(sprint: str) -> dict:
    sprint_doc = frappe.get_doc("VT Sprint", sprint)
    start = getdate(sprint_doc.start_date)
    end = getdate(sprint_doc.end_date)
    days = (end - start).days + 1
    if days <= 0:
        return {"labels": [], "ideal": [], "remaining": [], "unestimated_count": 0}

    tasks = frappe.db.sql("""
        SELECT estimated_minutes, completion_date
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND estimated_minutes > 0
    """, {"sprint": sprint}, as_dict=True)

    total = sum(float(t["estimated_minutes"]) for t in tasks)

    labels, ideal, remaining = [], [], []
    for i in range(days):
        d = add_days(start, i)
        d_date = getdate(d)
        labels.append(str(d_date))
        ideal.append(round(total * (1 - i / (days - 1)) if days > 1 else 0.0, 2))
        rem = sum(
            float(t["estimated_minutes"])
            for t in tasks
            if t["completion_date"] is None or getdate(t["completion_date"]) > d_date
        )
        remaining.append(float(rem))

    unestimated_count = frappe.db.count(
        "VT Task",
        filters={"sprint": sprint, "estimated_minutes": 0},
    )

    return {
        "labels": labels,
        "ideal": ideal,
        "remaining": remaining,
        "unestimated_count": int(unestimated_count),
    }
