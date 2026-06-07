import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.threshold import get_project_threshold, THRESHOLD_KEYS


class TestThreshold(FrappeTestCase):
	def setUp(self):
		settings = frappe.get_single("VT Settings")
		settings.default_blocked_days_threshold = 3
		settings.default_slip_pct_threshold = 20
		settings.default_capacity_pct_threshold = 120
		settings.save(ignore_permissions=True)

	def _make_project(self, **fields):
		doc = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "Threshold Test Project",
			"parent_vt_item": None,
			**fields,
		}).insert(ignore_permissions=True)
		return doc.name

	def test_unknown_key_raises(self):
		with self.assertRaises(ValueError):
			get_project_threshold(None, "unknown_key")

	def test_no_project_returns_settings_default(self):
		self.assertEqual(get_project_threshold(None, "blocked_days"), 3)
		self.assertEqual(get_project_threshold(None, "slip_pct"), 20)
		self.assertEqual(get_project_threshold(None, "capacity_pct"), 120)

	def test_project_field_overrides_settings(self):
		project = self._make_project(blocked_days_threshold=7)
		self.assertEqual(get_project_threshold(project, "blocked_days"), 7)
		# unset project fields fall back to settings defaults
		self.assertEqual(get_project_threshold(project, "slip_pct"), 20)
		self.assertEqual(get_project_threshold(project, "capacity_pct"), 120)

	def test_threshold_keys_complete(self):
		self.assertEqual(set(THRESHOLD_KEYS), {"blocked_days", "slip_pct", "capacity_pct"})
