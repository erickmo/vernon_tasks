import frappe
from frappe.model.document import Document

VALID_PDCA_TRANSITIONS = {
    "PLAN": ["DO"],
    "DO": ["CHECK"],
    "CHECK": ["ACT", "CLOSED"],
    "ACT": ["PLAN", "DO"],
    "CLOSED": [],
}


class Objective(Document):
    def validate(self):
        if not self.is_new():
            old_phase = frappe.db.get_value("Objective", self.name, "pdca_phase")
            if old_phase != self.pdca_phase:
                allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
                if self.pdca_phase not in allowed:
                    frappe.throw(
                        f"Invalid PDCA transition: {old_phase} → {self.pdca_phase}. "
                        f"Allowed: {', '.join(allowed) or 'none'}"
                    )


def get_objective_progress(objective_name: str) -> float:
    key_results = frappe.get_all(
        "Key Result",
        filters={"objective": objective_name},
        fields=["target_value", "current_value"]
    )
    if not key_results:
        return 0.0
    total = sum(
        min(kr.current_value / kr.target_value, 1.0)
        for kr in key_results
        if kr.target_value > 0
    )
    return round((total / len(key_results)) * 100, 2)
