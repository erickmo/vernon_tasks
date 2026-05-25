"""Tests for Risk Event controller."""
from datetime import datetime, timedelta

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.doctype.risk_event.risk_event import REASON_MAX_LEN

TEST_BRAND = "Test Risk Brand"
TEST_PROJECT_TITLE = "Test Risk Project"
TEST_PROJECT_TITLE_ALT = "Test Risk Project Alt"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_project(title: str) -> str:
	existing = frappe.db.get_value("VT Project", {"title": title}, "name")
	if existing:
		return existing
	return frappe.get_doc({
		"doctype": "VT Project",
		"title": title,
		"brand": TEST_BRAND,
		"project_owner": "Administrator",
		"start_date": "2026-01-01",
		"end_date": "2026-12-31",
	}).insert(ignore_permissions=True).name


class _RiskBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		self.project = _ensure_project(TEST_PROJECT_TITLE)
		self.project_alt = _ensure_project(TEST_PROJECT_TITLE_ALT)
		self.task = frappe.get_doc({
			"doctype": "VT Task", "title": "Risk Task",
			"project": self.project, "weight": 1.0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		for r in frappe.get_all("Risk Event", filters={"project": ["in", [self.project, self.project_alt]]}, pluck="name"):
			frappe.delete_doc("Risk Event", r, force=True, ignore_permissions=True)
		frappe.delete_doc("VT Task", self.task.name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "Risk Event",
			"project": self.project,
			"reason": "overdue",
			"severity": "med",
			"detected_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestRiskEventCRUD(_RiskBase):
	def test_create(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertEqual(doc.severity, "med")

	def test_update_severity(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.severity = "high"
		doc.save()
		self.assertEqual(frappe.db.get_value("Risk Event", doc.name, "severity"), "high")


class TestRiskEventValidations(_RiskBase):
	def test_reason_normalized(self):
		doc = self._make(reason="  no   checkin  ").insert(ignore_permissions=True)
		self.assertEqual(doc.reason, "no checkin")

	def test_reason_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(reason="X" * (REASON_MAX_LEN + 1)).insert(ignore_permissions=True)

	def test_invalid_severity_rejected(self):
		"""Frappe Select rejects unknown options before our controller — accept either."""
		with self.assertRaises(frappe.ValidationError):
			self._make(severity="critical").insert(ignore_permissions=True)

	def test_resolved_before_detected_rejected(self):
		detected = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
		resolved = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
		with self.assertRaises(frappe.ValidationError):
			self._make(detected_at=detected, resolved_at=resolved).insert(ignore_permissions=True)

	def test_task_must_belong_to_project(self):
		"""task.project must match risk_event.project — no cross-project leakage."""
		with self.assertRaises(frappe.ValidationError):
			self._make(
				project=self.project_alt,
				task=self.task.name,
			).insert(ignore_permissions=True)

	def test_task_matching_project_allowed(self):
		doc = self._make(task=self.task.name).insert(ignore_permissions=True)
		self.assertEqual(doc.task, self.task.name)
