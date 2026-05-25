"""Tests for Vernon Telemetry Event controller."""
from datetime import timedelta

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime


class _TelemetryBase(FrappeTestCase):
	def setUp(self):
		self._created: list[str] = []

	def tearDown(self):
		for name in self._created:
			if frappe.db.exists("Vernon Telemetry Event", name):
				frappe.delete_doc("Vernon Telemetry Event", name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {"doctype": "Vernon Telemetry Event", "event": "pwa_boot"}
		base.update(overrides)
		doc = frappe.get_doc(base).insert(ignore_permissions=True)
		self._created.append(doc.name)
		return doc


class TestTelemetryDefaults(_TelemetryBase):
	def test_before_insert_fills_user_and_timestamp(self):
		doc = self._make(event="page_view")
		self.assertEqual(doc.user, frappe.session.user)
		self.assertIsNotNone(doc.timestamp)


class TestTelemetryValidations(_TelemetryBase):
	def test_invalid_event_name_rejected(self):
		"""Spaces in event names break group-by queries — reject."""
		with self.assertRaises(frappe.ValidationError):
			self._make(event="page view with space")

	def test_event_name_special_chars_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(event="page-view!")

	def test_dotted_event_name_allowed(self):
		doc = self._make(event="task.completed")
		self.assertEqual(doc.event, "task.completed")

	def test_future_timestamp_rejected(self):
		"""Use Frappe's site-tz now + ample buffer past the 5-min skew tolerance."""
		future = (now_datetime() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
		with self.assertRaises(frappe.ValidationError):
			self._make(timestamp=future)

	def test_invalid_props_json_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(props="{not valid")

	def test_valid_props_json_allowed(self):
		doc = self._make(props='{"version": "abc123"}')
		self.assertEqual(doc.props, '{"version": "abc123"}')
