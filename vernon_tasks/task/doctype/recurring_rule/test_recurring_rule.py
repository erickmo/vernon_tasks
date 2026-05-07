import frappe
from frappe.tests.utils import FrappeTestCase
from datetime import date


class TestRecurringRule(FrappeTestCase):
    def _make_rule(self, rule_type="Daily", interval=1, **kwargs):
        doc = frappe.get_doc({"doctype": "Recurring Rule", "rule_type": rule_type, "interval": interval, **kwargs})
        doc.insert(ignore_permissions=True)
        return doc

    def test_create_daily_rule(self):
        doc = self._make_rule("Daily", 1)
        self.assertEqual(doc.rule_type, "Daily")
        doc.delete()

    def test_next_occurrence_daily(self):
        from vernon_tasks.task.doctype.recurring_rule.recurring_rule import get_next_occurrence
        doc = self._make_rule("Daily", 1)
        next_date = get_next_occurrence(doc.name, date(2026, 5, 7))
        self.assertEqual(next_date, date(2026, 5, 8))
        doc.delete()

    def test_next_occurrence_weekly(self):
        from vernon_tasks.task.doctype.recurring_rule.recurring_rule import get_next_occurrence
        doc = self._make_rule("Weekly", 1)
        next_date = get_next_occurrence(doc.name, date(2026, 5, 7))
        self.assertEqual(next_date, date(2026, 5, 14))
        doc.delete()

    def test_next_occurrence_monthly(self):
        from vernon_tasks.task.doctype.recurring_rule.recurring_rule import get_next_occurrence
        doc = self._make_rule("Monthly", 1)
        next_date = get_next_occurrence(doc.name, date(2026, 5, 7))
        self.assertEqual(next_date, date(2026, 6, 7))
        doc.delete()

    def test_is_expired_by_end_date(self):
        from vernon_tasks.task.doctype.recurring_rule.recurring_rule import is_rule_expired
        doc = self._make_rule("Daily", 1, end_date="2026-05-01")
        self.assertTrue(is_rule_expired(doc.name, occurrence_count=0, as_of=date(2026, 5, 7)))
        doc.delete()

    def test_is_expired_by_max_occurrences(self):
        from vernon_tasks.task.doctype.recurring_rule.recurring_rule import is_rule_expired
        doc = self._make_rule("Daily", 1, max_occurrences=5)
        self.assertTrue(is_rule_expired(doc.name, occurrence_count=5, as_of=date(2026, 5, 7)))
        self.assertFalse(is_rule_expired(doc.name, occurrence_count=3, as_of=date(2026, 5, 7)))
        doc.delete()
