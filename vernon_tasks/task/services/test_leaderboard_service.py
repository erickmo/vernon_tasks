import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_first_day, getdate, today

from vernon_tasks.task.services.leaderboard_service import get_leaderboard, period_window

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED"; the per-task assignee Link assigned_to→owner_user.
_DONE_PHASE = "CLOSED"


class TestLeaderboard(FrappeTestCase):
	def setUp(self):
		for email in ("lb-a@x.com", "lb-b@x.com"):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": "T",
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)

		# Project is a root VT Item node; Tasks are its children (the old
		# VT Task.project Link is now the parent_vt_item tree relation).
		project = frappe.get_doc({
			"doctype": "VT Item", "node_type": "Project", "title": "LB-Proj",
		}).insert(ignore_permissions=True)
		self.project = project.name
		self._created_tasks = []

		# Use dates anchored to the first day of the current month so the
		# fixtures are always inside the "month" window regardless of which
		# day of the month the tests run.  (add_days(today(), -N) can land in
		# the previous month when today is within the first few days.)
		month_start = get_first_day(getdate(today()))

		def _t(user, pts, day_offset):
			# earned_points / completion_date are plain (not read_only) on VT
			# Item, so they can be set directly on insert — no db_set needed.
			doc = frappe.get_doc({
				"doctype": "VT Item", "node_type": "Task", "title": "T",
				"parent_vt_item": self.project, "owner_user": user,
				"estimated_minutes": 1,
				"pdca_phase": _DONE_PHASE,
				"earned_points": pts,
				"completion_date": add_days(month_start, day_offset),
			}).insert(ignore_permissions=True)
			self._created_tasks.append(doc.name)
			return doc

		_t("lb-a@x.com", 30, 0)
		_t("lb-b@x.com", 10, 1)
		_t("lb-b@x.com", 10, 2)

	def tearDown(self):
		for task_name in getattr(self, "_created_tasks", []):
			if frappe.db.exists("VT Item", task_name):
				frappe.delete_doc("VT Item", task_name, force=True)
		if getattr(self, "project", None) and frappe.db.exists("VT Item", self.project):
			frappe.delete_doc("VT Item", self.project, force=True)

	def test_month_leaderboard_orders_by_points(self):
		result = get_leaderboard("month")
		usrs = [r["user"] for r in result if r["user"] in ("lb-a@x.com", "lb-b@x.com")]
		self.assertEqual(usrs[:2], ["lb-a@x.com", "lb-b@x.com"])

	def test_includes_task_count(self):
		result = get_leaderboard("month")
		b_row = [r for r in result if r["user"] == "lb-b@x.com"][0]
		self.assertEqual(b_row["task_count"], 2)
		self.assertEqual(b_row["points"], 20.0)

	def test_invalid_period_raises(self):
		with self.assertRaises(ValueError):
			get_leaderboard("yearly")

	def test_period_window_returns_tuple(self):
		start, end = period_window("week")
		self.assertLessEqual(start, end)
