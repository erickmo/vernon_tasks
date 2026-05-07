import frappe
from frappe.model.document import Document


class UserPointSummary(Document):
    pass


def get_or_create_period(user: str, period: str) -> "UserPointSummary":
    name = frappe.db.get_value(
        "User Point Summary", {"user": user, "period": period}, "name"
    )
    if name:
        return frappe.get_doc("User Point Summary", name)
    doc = frappe.get_doc({
        "doctype": "User Point Summary",
        "user": user,
        "period": period,
        "total_earned": 0,
        "total_penalty": 0,
        "total_bonus": 0,
        "total_override_delta": 0,
        "net_points": 0,
    })
    doc.insert(ignore_permissions=True)
    return doc


def add_points_to_period(
    user: str,
    period: str,
    earned: float = 0,
    bonus: float = 0,
    penalty: float = 0,
    override_delta: float = 0,
) -> None:
    doc = get_or_create_period(user, period)
    doc.total_earned += earned
    doc.total_bonus += bonus
    doc.total_penalty += penalty
    doc.total_override_delta += override_delta
    doc.net_points = (
        doc.total_earned + doc.total_bonus - doc.total_penalty + doc.total_override_delta
    )
    doc.save(ignore_permissions=True)
