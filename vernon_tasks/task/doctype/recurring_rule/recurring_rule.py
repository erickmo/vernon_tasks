from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
import frappe
from frappe.model.document import Document


class RecurringRule(Document):
    pass


def get_next_occurrence(rule_name: str, from_date: date) -> date:
    rule = frappe.get_doc("Recurring Rule", rule_name)
    interval = rule.interval or 1

    if rule.rule_type == "Daily":
        return from_date + timedelta(days=interval)
    elif rule.rule_type == "Weekly":
        return from_date + timedelta(weeks=interval)
    elif rule.rule_type == "Monthly":
        return from_date + relativedelta(months=interval)
    elif rule.rule_type == "Custom":
        days_map = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
        if rule.days_of_week:
            allowed = [days_map[d.strip()] for d in rule.days_of_week.split(",") if d.strip() in days_map]
            candidate = from_date + timedelta(days=1)
            for _ in range(14):
                if candidate.weekday() in allowed:
                    return candidate
                candidate += timedelta(days=1)
        return from_date + timedelta(days=interval)
    return from_date + timedelta(days=1)


def is_rule_expired(rule_name: str, occurrence_count: int, as_of: date) -> bool:
    rule = frappe.get_doc("Recurring Rule", rule_name)
    if rule.end_date and as_of > frappe.utils.getdate(rule.end_date):
        return True
    if rule.max_occurrences and occurrence_count >= rule.max_occurrences:
        return True
    return False
