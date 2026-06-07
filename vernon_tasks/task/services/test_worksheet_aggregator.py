import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

WS_USER = "test_worksheet_user@example.com"
_OKR_TITLE = "WS-OKR"
_PROJ_TITLE = "WS-Proj"
_MONDAY = "2026-05-18"  # a Monday
_TUESDAY = "2026-05-19"  # Tue within the same week


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "last_name": "W",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


def _make(node_type, title, parent=None, **fields):
	doc = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": node_type,
		"title": title,
		"parent_vt_item": parent,
		**fields,
	})
	doc.insert(ignore_permissions=True)
	return doc


class TestWorksheetAggregator(FrappeTestCase):
	def setUp(self):
		_ensure_user(WS_USER)
		# OKR carries the Key Results; Project hangs under the OKR so its KRs
		# are reachable; the scheduled Task is assigned to WS_USER (owner_user).
		self.okr = _make("OKR", _OKR_TITLE, period="2026-Q2")
		self.okr.append("key_results", {
			"metric": "Revenue", "target_value": 100, "current_value": 40,
		})
		self.okr.save(ignore_permissions=True)
		self.project = _make("Project", _PROJ_TITLE, parent=self.okr.name,
			pdca_phase="DO", health_status="Open")
		self.task = _make("Task", "WS Scheduled Task", parent=self.project.name,
			owner_user=WS_USER, pdca_phase="DO", base_points=5,
			deadline=_TUESDAY)
		self.task.append("schedule_entries", {
			"date": _TUESDAY, "allocated_minutes": 120.0,
			"minutes_planned": 120.0, "hour_start": 9, "owner_user": WS_USER,
		})
		self.task.save(ignore_permissions=True)
		# A second open Task with no schedule entry → must surface as unscheduled.
		self.open_task = _make("Task", "WS Open Task", parent=self.project.name,
			owner_user=WS_USER, pdca_phase="PLAN", base_points=2)

	def tearDown(self):
		frappe.db.delete("Task Schedule Entry", {"parent": self.task.name})
		for doc in (self.open_task, self.task, self.project, self.okr):
			frappe.delete_doc("VT Item", doc.name, force=True, ignore_permissions=True)

	def test_payload_shape(self):
		frappe.set_user("Administrator")
		out = build_worksheet(user="Administrator", week_start=_MONDAY)
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
			build_worksheet(user="Administrator", week_start=_TUESDAY)

	def test_scheduled_entry_lands_on_its_day(self):
		out = build_worksheet(user=WS_USER, week_start=_MONDAY)
		tue = next(d for d in out["days"] if d["date"] == _TUESDAY)
		self.assertEqual(len(tue["entries"]), 1)
		entry = tue["entries"][0]
		self.assertEqual(entry["task_id"], self.task.name)
		self.assertEqual(entry["minutes_planned"], 120.0)
		self.assertEqual(entry["hour_start"], 9)
		self.assertEqual(entry["points"], 5)
		# 120 minutes ÷ 60 = 2.0 scheduled hours on that day.
		self.assertEqual(tue["scheduled_hours"], 2.0)

	def test_linked_kr_resolved_via_okr_ancestor(self):
		out = build_worksheet(user=WS_USER, week_start=_MONDAY)
		tue = next(d for d in out["days"] if d["date"] == _TUESDAY)
		self.assertTrue(tue["entries"][0]["linked_kr"])

	def test_open_task_without_entry_is_unscheduled(self):
		out = build_worksheet(user=WS_USER, week_start=_MONDAY)
		unscheduled_ids = {u["task_id"] for u in out["unscheduled"]}
		self.assertIn(self.open_task.name, unscheduled_ids)
		# The scheduled task must NOT appear in the unscheduled tray.
		self.assertNotIn(self.task.name, unscheduled_ids)
