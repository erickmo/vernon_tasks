import frappe
from frappe.model.document import Document
from frappe.utils import getdate

VALID_PDCA_TRANSITIONS = {
    "PLAN": ["DO"],
    "DO": ["CHECK"],
    "CHECK": ["ACT", "CLOSED"],
    "ACT": ["PLAN", "DO"],
    "CLOSED": [],
}


class VTProject(Document):
    def validate(self):
        if self.end_date and self.start_date and getdate(self.end_date) <= getdate(self.start_date):
            frappe.throw("End Date must be after Start Date")
        self._validate_pdca_transition()

    def _validate_pdca_transition(self):
        if self.is_new():
            return
        old_phase = frappe.db.get_value("VT Project", self.name, "pdca_phase")
        if old_phase != self.pdca_phase:
            allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
            if self.pdca_phase not in allowed:
                frappe.throw(
                    f"Invalid PDCA transition: {old_phase} → {self.pdca_phase}. "
                    f"Allowed: {', '.join(allowed) or 'none'}"
                )


def is_user_owner(project_name: str, user: str) -> bool:
    return frappe.db.get_value("VT Project", project_name, "project_owner") == user


def is_user_leader(project_name: str, user: str) -> bool:
    leader = frappe.db.get_value("VT Project", project_name, "project_leader")
    if leader == user:
        return True
    return bool(frappe.db.get_value(
        "Project Team Member",
        {"parent": project_name, "user": user, "role": "Leader"},
        "name"
    ))


def is_user_in_project(project_name: str, user: str) -> bool:
    if is_user_owner(project_name, user):
        return True
    return bool(frappe.db.get_value(
        "Project Team Member",
        {"parent": project_name, "user": user},
        "name"
    ))


def assert_user_is_leader(project_name: str, user: str) -> None:
    if not is_user_leader(project_name, user) and not is_user_owner(project_name, user):
        frappe.throw(
            "Only the Project Leader or Owner can perform this action",
            frappe.PermissionError
        )


def validate_team(doc, method):
    pass
