import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services.worksheet_aggregator import build_worksheet


class TestWorksheetAggregator(FrappeTestCase):
    def test_payload_shape(self):
        frappe.set_user("Administrator")
        out = build_worksheet(user="Administrator", week_start="2026-05-18")
        self.assertEqual(
            set(out.keys()),
            {"week_start", "week_end", "capacity_hours", "days", "unscheduled"},
        )
        self.assertEqual(len(out["days"]), 7)
        for d in out["days"]:
            self.assertIn("date", d)
            self.assertIn("entries", d)
            self.assertIn("scheduled_hours", d)

    def test_week_start_must_be_monday(self):
        with self.assertRaises(ValueError):
            build_worksheet(user="Administrator", week_start="2026-05-19")
