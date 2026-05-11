import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

PDCA_KANBAN_MAP = {
    "BACKLOG": "Backlog",
    "PLAN": "Scheduled",
    "DO": "In Progress",
    "CHECK": "In Review",
    "ACT": "Revision",
    "DONE": "Done",
}

VALID_PDCA_TRANSITIONS = {
    "BACKLOG": ["PLAN"],
    "PLAN": ["DO"],
    "DO": ["CHECK"],
    "CHECK": ["ACT", "DONE", "DO"],
    "ACT": ["DO"],
    "DONE": [],
}


class VTTask(Document):
    def validate(self):
        self._validate_dates()
        self._validate_pdca_transition()
        self._sync_kanban_status()
        self._validate_recurring()
        self._validate_dependencies()

    def _validate_dates(self):
        if self.start_date and self.deadline:
            if getdate(self.deadline) <= getdate(self.start_date):
                frappe.throw("Deadline must be after Start Date")

    def _validate_pdca_transition(self):
        if self.is_new():
            return
        old_phase = frappe.db.get_value("VT Task", self.name, "pdca_phase")
        if old_phase != self.pdca_phase:
            allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
            if self.pdca_phase not in allowed:
                frappe.throw(
                    f"Invalid PDCA transition: {old_phase} → {self.pdca_phase}. "
                    f"Allowed: {', '.join(allowed) or 'none'}"
                )

    def _sync_kanban_status(self):
        if self.kanban_status == "Blocked":
            return
        self.kanban_status = PDCA_KANBAN_MAP.get(self.pdca_phase, self.kanban_status)

    def _validate_recurring(self):
        if self.is_recurring and not self.recurring_rule:
            frappe.throw("Recurring Rule is required when Is Recurring is enabled")

    def _validate_dependencies(self):
        for dep in (self.dependencies or []):
            if dep.blocked_by == self.name:
                frappe.throw("A task cannot block itself")

    def on_submit(self):
        if self.pdca_phase == "DONE":
            self.completion_date = today()
            self.db_set("completion_date", self.completion_date)


def validate_permissions(doc, method):
    pass


def get_blocked_tasks_for_user(user: str) -> list:
    return frappe.db.sql("""
        SELECT DISTINCT t.name, t.title, t.project, t.deadline, td.blocked_by
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        WHERE t.assigned_to = %(user)s
          AND t.pdca_phase NOT IN ('DONE')
          AND EXISTS (
            SELECT 1 FROM `tabVT Task` bt
            WHERE bt.name = td.blocked_by AND bt.pdca_phase != 'DONE'
          )
    """, {"user": user}, as_dict=True)


def get_tasks_for_user_today(user: str) -> list:
    from frappe.utils import today as get_today
    return frappe.db.sql("""
        SELECT t.name, t.title, t.project, t.priority, t.deadline,
               t.pdca_phase, t.kanban_status, se.allocated_hours
        FROM `tabVT Task` t
        INNER JOIN `tabTask Schedule Entry` se ON se.parent = t.name
        WHERE t.assigned_to = %(user)s
          AND se.date = %(date)s
          AND t.pdca_phase NOT IN ('DONE')
        ORDER BY t.priority DESC, t.deadline ASC
    """, {"user": user, "date": get_today()}, as_dict=True)
