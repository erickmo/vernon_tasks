import frappe
from frappe.utils import today


def execute(filters=None):
    filters = filters or {}
    report_date = filters.get("date") or today()
    columns = [
        {"fieldname": "user", "label": "User", "fieldtype": "Link", "options": "User", "width": 180},
        {"fieldname": "target_hours", "label": "Target (h)", "fieldtype": "Float", "width": 100},
        {"fieldname": "scheduled_hours", "label": "Scheduled (h)", "fieldtype": "Float", "width": 120},
        {"fieldname": "utilization_pct", "label": "Utilization %", "fieldtype": "Percent", "width": 120},
        {"fieldname": "status", "label": "Status", "fieldtype": "Data", "width": 120},
        {"fieldname": "blocked_tasks", "label": "Blocked Tasks", "fieldtype": "Int", "width": 120},
    ]
    users = frappe.get_all("Work Profile", fields=["user", "daily_target_hours"])
    settings = frappe.get_single("VT Settings")
    default_target = settings.default_daily_target_hours or 8.0
    data = []
    for u in users:
        target = u.daily_target_hours or default_target
        scheduled = frappe.db.sql("""
            SELECT COALESCE(SUM(se.allocated_minutes), 0)
            FROM `tabTask Schedule Entry` se
            INNER JOIN `tabVT Item` t ON t.name = se.parent AND t.node_type = 'Task'
            WHERE t.owner_user = %(user)s AND se.date = %(date)s AND t.docstatus < 2
        """, {"user": u.user, "date": report_date})[0][0] or 0.0
        blocked = frappe.db.sql("""
            SELECT COUNT(DISTINCT t.name) FROM `tabVT Item` t
            INNER JOIN `tabTask Dependency` td ON td.parent = t.name
            INNER JOIN `tabVT Item` bt ON bt.name = td.blocked_by AND bt.node_type = 'Task'
            WHERE t.owner_user = %(user)s AND t.node_type = 'Task'
              AND t.pdca_phase NOT IN ('CLOSED')
              AND bt.pdca_phase NOT IN ('CLOSED')
        """, {"user": u.user})[0][0] or 0
        pct = round((float(scheduled) / target) * 100, 1) if target else 0
        status = "Over Capacity" if pct > 100 else ("Under Utilized" if pct < 50 else "On Track")
        data.append({"user": u.user, "target_hours": target, "scheduled_hours": float(scheduled),
                     "utilization_pct": pct, "status": status, "blocked_tasks": blocked})
    return columns, data
