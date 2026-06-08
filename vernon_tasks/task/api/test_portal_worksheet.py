import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api import portal_worksheet as pw

_PROJ_TITLE = "TEST-PW-PROJ"
_WEEK_START = "2026-05-18"  # a Monday
_PREV_MONDAY = "2026-05-11"  # the Monday before _WEEK_START


def _cleanup_proj():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for proj in frappe.get_all(
		"VT Item",
		{"title": _PROJ_TITLE, "node_type": "Project"},
		["name", "lft", "rgt"],
	):
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True)
		frappe.delete_doc("VT Item", proj["name"], force=True)


class TestPortalWorksheetApi(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.user = "pw_user@test.local"
		if not frappe.db.exists("User", cls.user):
			frappe.get_doc({
				"doctype": "User", "email": cls.user, "first_name": "PW User",
				"roles": [{"role": "VT Member"}],
			}).insert(ignore_permissions=True)
		frappe.set_user("Administrator")
		_cleanup_proj()
		cls.project = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": _PROJ_TITLE,
			"owner_user": "Administrator",
			"health_status": "Open",
		}).insert(ignore_permissions=True).name

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		_cleanup_proj()
		super().tearDownClass()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _make_task(self, owner, title="T", pdca_phase="DO"):
		return frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Task",
			"title": title,
			"owner_user": owner,
			"parent_vt_item": self.project,
			"pdca_phase": pdca_phase,
		}).insert(ignore_permissions=True)

	# --- original assertions (preserved) ---

	def test_get_worksheet_requires_login(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			pw.get_worksheet(week_start=_WEEK_START)

	def test_get_worksheet_returns_shape(self):
		frappe.set_user("Administrator")
		out = pw.get_worksheet(week_start=_WEEK_START)
		self.assertIn("days", out)
		self.assertIn("unscheduled", out)

	def test_team_view_requires_leader_role(self):
		frappe.set_user("Administrator")
		out = pw.get_team_worksheet(week_start=_WEEK_START)
		self.assertIsInstance(out, list)

	# --- migrated read/write round-trips over VT Item tree ---

	def test_schedule_task_appends_entry(self):
		frappe.set_user("Administrator")
		task = self._make_task("Administrator")
		out = pw.schedule_task(task_id=task.name, date=_WEEK_START, hour_start=9, hours=2.0)
		self.assertEqual(out["task_id"], task.name)
		self.assertTrue(out["entry_id"])
		reloaded = frappe.get_doc("VT Item", task.name)
		rows = reloaded.schedule_entries
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0].hour_start, 9)
		self.assertEqual(rows[0].minutes_planned, 2.0)
		self.assertEqual(rows[0].owner_user, "Administrator")

	def test_update_entry_changes_fields(self):
		frappe.set_user("Administrator")
		task = self._make_task("Administrator")
		created = pw.schedule_task(task_id=task.name, date=_WEEK_START, hour_start=9, hours=2.0)
		entry_id = created["entry_id"]
		out = pw.update_entry(entry_id=entry_id, hour_start=14, hours=3.0)
		self.assertEqual(out["entry_id"], entry_id)
		self.assertEqual(out["task_id"], task.name)
		row = frappe.get_doc("Task Schedule Entry", entry_id)
		self.assertEqual(row.hour_start, 14)
		self.assertEqual(row.minutes_planned, 3.0)
		self.assertEqual(row.allocated_minutes, 3.0)

	def test_unschedule_removes_entry(self):
		frappe.set_user("Administrator")
		task = self._make_task("Administrator")
		created = pw.schedule_task(task_id=task.name, date=_WEEK_START, hour_start=9, hours=2.0)
		entry_id = created["entry_id"]
		out = pw.unschedule(entry_id=entry_id)
		self.assertTrue(out["deleted"])
		self.assertEqual(out["task_id"], task.name)
		reloaded = frappe.get_doc("VT Item", task.name)
		self.assertEqual(len(reloaded.schedule_entries), 0)

	def test_bulk_carry_over_copies_open_task_entries(self):
		frappe.set_user("Administrator")
		task = self._make_task("Administrator", pdca_phase="DO")
		# Schedule an entry in the previous week.
		pw.schedule_task(task_id=task.name, date=_PREV_MONDAY, hour_start=10, hours=1.0)
		out = pw.bulk_carry_over(week_start=_WEEK_START)
		self.assertEqual(out["week_start"], _WEEK_START)
		self.assertEqual(out["copied"], 1)
		reloaded = frappe.get_doc("VT Item", task.name)
		dates = sorted(str(r.date) for r in reloaded.schedule_entries)
		self.assertEqual(dates, [_PREV_MONDAY, _WEEK_START])

	def test_bulk_carry_over_rejects_non_monday(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			pw.bulk_carry_over(week_start="2026-05-19")

	def test_schedule_task_rejects_bad_slot(self):
		frappe.set_user("Administrator")
		task = self._make_task("Administrator")
		with self.assertRaises(frappe.ValidationError):
			pw.schedule_task(task_id=task.name, date=_WEEK_START, hour_start=25, hours=1.0)
		with self.assertRaises(frappe.ValidationError):
			pw.schedule_task(task_id=task.name, date=_WEEK_START, hour_start=9, hours=0)

	def test_team_worksheet_aggregates_minutes_by_user_and_day(self):
		# Schedule entries for a dedicated user so the aggregation bucket is not
		# polluted by any pre-existing Administrator-owned schedule data.
		frappe.set_user("Administrator")
		task = self._make_task(self.user)
		row_a = task.append("schedule_entries", {
			"date": _WEEK_START, "minutes_planned": 2.0, "allocated_minutes": 2.0,
			"hour_start": 9, "owner_user": self.user, "is_override": 0,
		})
		row_b = task.append("schedule_entries", {
			"date": _WEEK_START, "minutes_planned": 1.0, "allocated_minutes": 1.0,
			"hour_start": 14, "owner_user": self.user, "is_override": 0,
		})
		task.save(ignore_permissions=True)
		out = pw.get_team_worksheet(week_start=_WEEK_START)
		user_rows = [r for r in out if r["user"] == self.user]
		self.assertEqual(len(user_rows), 1)
		day = user_rows[0]["days"][_WEEK_START]
		self.assertEqual(day["minutes"], 3.0)
		self.assertEqual(day["task_count"], 2)
		# All 7 ISO days are present in the bucket.
		self.assertEqual(len(user_rows[0]["days"]), 7)
		self.assertIsNotNone(row_a.name)
		self.assertIsNotNone(row_b.name)
