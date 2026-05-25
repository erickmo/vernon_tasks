"""Tests for Objective controller.

Covers:
  - Full CRUD lifecycle
  - Field validations (title normalize/length, period format, period range)
  - Period auto-fill (period_start/period_end derived from period string)
  - PDCA transition guard (allowed/forbidden moves)
  - Status / PDCA consistency
  - Cross-domain FK guard (on_trash blocks if Key Results or KPIs link here)
  - get_objective_progress aggregate helper

ADR-007 — OKR doctype model.
ADR-022 — REST-first, hooks-for-logic.
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.okr.doctype.objective.objective import (
	OBJECTIVE_TITLE_MAX_LEN,
	get_objective_progress,
)

TEST_USER = "test_okr@example.com"
TEST_BRAND = "Test OKR Brand"


def _ensure_user():
	"""Idempotent: create the OKR test user once per session."""
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "OKR", "last_name": "Test",
			"enabled": 1, "roles": [{"role": "VT Manager"}]
		}).insert(ignore_permissions=True)


def _ensure_brand(brand_name: str = TEST_BRAND):
	if not frappe.db.exists("VT Brand", brand_name):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": brand_name}).insert(ignore_permissions=True)


class TestObjectiveCRUD(FrappeTestCase):
	"""Happy-path lifecycle."""

	def setUp(self):
		_ensure_user()
		_ensure_brand()

	def _make(self, **overrides):
		base = {
			"doctype": "Objective",
			"title": "Test Obj",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
			"status": "Open",
		}
		base.update(overrides)
		return frappe.get_doc(base)

	def test_create_objective(self):
		"""Insert produces an OBJ-YYYY-##### name."""
		doc = self._make().insert(ignore_permissions=True)
		self.assertTrue(doc.name.startswith("OBJ-"))
		doc.delete()

	def test_read_objective(self):
		doc = self._make(title="Readable").insert(ignore_permissions=True)
		fetched = frappe.get_doc("Objective", doc.name)
		self.assertEqual(fetched.title, "Readable")
		doc.delete()

	def test_update_description(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.description = "Updated"
		doc.save()
		self.assertEqual(frappe.db.get_value("Objective", doc.name, "description"), "Updated")
		doc.delete()

	def test_delete_objective(self):
		doc = self._make().insert(ignore_permissions=True)
		name = doc.name
		doc.delete()
		self.assertFalse(frappe.db.exists("Objective", name))


class TestObjectiveValidations(FrappeTestCase):
	"""Title + period validations."""

	def setUp(self):
		_ensure_user()
		_ensure_brand()

	def _make(self, **overrides):
		base = {
			"doctype": "Objective",
			"title": "T",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
		}
		base.update(overrides)
		return frappe.get_doc(base)

	def test_title_normalized(self):
		"""Whitespace trimmed + internal runs collapsed."""
		doc = self._make(title="  Increase   Revenue  ").insert(ignore_permissions=True)
		self.assertEqual(doc.title, "Increase Revenue")
		doc.delete()

	def test_title_max_length(self):
		too_long = "X" * (OBJECTIVE_TITLE_MAX_LEN + 1)
		with self.assertRaises(frappe.ValidationError):
			self._make(title=too_long).insert(ignore_permissions=True)

	def test_invalid_period_format_rejected(self):
		"""Period must match YYYY, YYYY-Hn, YYYY-Qn, or YYYY-MM."""
		with self.assertRaises(frappe.ValidationError):
			self._make(period="not-a-period").insert(ignore_permissions=True)

	def test_period_quarter_auto_fills_dates(self):
		"""2026-Q2 → period_start=2026-04-01, period_end=2026-06-30."""
		doc = self._make(period="2026-Q2", period_start=None, period_end=None).insert(ignore_permissions=True)
		self.assertEqual(str(doc.period_start), "2026-04-01")
		self.assertEqual(str(doc.period_end), "2026-06-30")
		doc.delete()

	def test_period_year_auto_fills_dates(self):
		"""2026 → 2026-01-01 .. 2026-12-31."""
		doc = self._make(period="2026", period_start=None, period_end=None).insert(ignore_permissions=True)
		self.assertEqual(str(doc.period_start), "2026-01-01")
		self.assertEqual(str(doc.period_end), "2026-12-31")
		doc.delete()

	def test_period_month_auto_fills_dates(self):
		"""2026-05 → 2026-05-01 .. 2026-05-31."""
		doc = self._make(period="2026-05", period_start=None, period_end=None).insert(ignore_permissions=True)
		self.assertEqual(str(doc.period_start), "2026-05-01")
		self.assertEqual(str(doc.period_end), "2026-05-31")
		doc.delete()

	def test_explicit_dates_not_overwritten(self):
		"""Caller-provided period_start/period_end take precedence over auto-derived."""
		doc = self._make(
			period="2026-Q2",
			period_start="2026-04-15",
			period_end="2026-05-10",
		).insert(ignore_permissions=True)
		self.assertEqual(str(doc.period_start), "2026-04-15")
		self.assertEqual(str(doc.period_end), "2026-05-10")
		doc.delete()

	def test_period_end_before_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(
				period="2026-Q2",
				period_start="2026-06-30",
				period_end="2026-04-01",
			).insert(ignore_permissions=True)


class TestObjectivePDCA(FrappeTestCase):
	"""PDCA transition guard."""

	def setUp(self):
		_ensure_user()
		_ensure_brand()

	def _make(self, **overrides):
		base = {
			"doctype": "Objective",
			"title": "PDCA Obj",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
			"status": "Open",
		}
		base.update(overrides)
		return frappe.get_doc(base)

	def test_pdca_valid_transition(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.pdca_phase = "DO"
		doc.save()
		self.assertEqual(doc.pdca_phase, "DO")
		doc.delete()

	def test_pdca_invalid_transition_raises(self):
		"""PLAN → CHECK is forbidden (must go PLAN → DO → CHECK)."""
		doc = self._make().insert(ignore_permissions=True)
		doc.pdca_phase = "CHECK"
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		doc.delete()

	def test_pdca_closed_locks_status(self):
		"""Moving to CLOSED phase auto-sets status=Closed."""
		doc = self._make().insert(ignore_permissions=True)
		doc.pdca_phase = "DO"
		doc.save()
		doc.pdca_phase = "CHECK"
		doc.save()
		doc.pdca_phase = "CLOSED"
		doc.save()
		self.assertEqual(doc.status, "Closed")
		doc.delete()


class TestObjectiveOnTrash(FrappeTestCase):
	"""Cascade FK guard — blocks delete when KRs or KPI defs still link here."""

	def setUp(self):
		_ensure_user()
		_ensure_brand()
		self.obj = frappe.get_doc({
			"doctype": "Objective",
			"title": "Trash Obj",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		# Best-effort: detach KRs/KPIs so the objective can be removed.
		for kr in frappe.get_all("Key Result", filters={"objective": self.obj.name}, pluck="name"):
			frappe.delete_doc("Key Result", kr, force=True, ignore_permissions=True)
		for kpi in frappe.get_all("KPI Definition", filters={"objective": self.obj.name}, pluck="name"):
			frappe.db.set_value("KPI Definition", kpi, "objective", None)
		if frappe.db.exists("Objective", self.obj.name):
			frappe.delete_doc("Objective", self.obj.name, force=True, ignore_permissions=True)

	def test_on_trash_blocks_when_key_results_linked(self):
		frappe.get_doc({
			"doctype": "Key Result",
			"objective": self.obj.name,
			"metric": "FK Guard Metric",
			"target_value": 100,
			"current_value": 0,
		}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			self.obj.delete()

	def test_on_trash_allows_when_no_links(self):
		self.obj.delete()
		self.assertFalse(frappe.db.exists("Objective", self.obj.name))


class TestObjectiveProgress(FrappeTestCase):
	"""get_objective_progress aggregate."""

	def setUp(self):
		_ensure_user()
		_ensure_brand()
		self.obj = frappe.get_doc({
			"doctype": "Objective",
			"title": "Progress Obj",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		for kr in frappe.get_all("Key Result", filters={"objective": self.obj.name}, pluck="name"):
			frappe.delete_doc("Key Result", kr, force=True, ignore_permissions=True)
		frappe.delete_doc("Objective", self.obj.name, force=True, ignore_permissions=True)

	def test_progress_no_key_results(self):
		self.assertEqual(get_objective_progress(self.obj.name), 0.0)

	def test_progress_with_key_results_averages(self):
		"""Progress = mean of clamped (current/target) per KR × 100."""
		frappe.get_doc({
			"doctype": "Key Result", "objective": self.obj.name,
			"metric": "M1", "target_value": 100, "current_value": 50,
		}).insert(ignore_permissions=True)
		frappe.get_doc({
			"doctype": "Key Result", "objective": self.obj.name,
			"metric": "M2", "target_value": 100, "current_value": 100,
		}).insert(ignore_permissions=True)
		# (0.5 + 1.0) / 2 = 0.75 → 75.0
		self.assertEqual(get_objective_progress(self.obj.name), 75.0)
