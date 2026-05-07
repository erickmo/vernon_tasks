import frappe


def execute(filters=None):
    filters = filters or {}
    user = filters.get("user") or frappe.session.user
    columns = [
        {"fieldname": "period", "label": "Period", "fieldtype": "Data", "width": 120},
        {"fieldname": "total_earned", "label": "Base Earned", "fieldtype": "Float", "width": 120},
        {"fieldname": "total_bonus", "label": "Bonus", "fieldtype": "Float", "width": 100},
        {"fieldname": "total_penalty", "label": "Penalty", "fieldtype": "Float", "width": 100},
        {"fieldname": "total_override_delta", "label": "Override Δ", "fieldtype": "Float", "width": 100},
        {"fieldname": "net_points", "label": "Net Points", "fieldtype": "Float", "width": 120},
    ]
    data = frappe.get_all(
        "User Point Summary", filters={"user": user},
        fields=["period","total_earned","total_bonus","total_penalty","total_override_delta","net_points"],
        order_by="period DESC",
    )
    return columns, data
