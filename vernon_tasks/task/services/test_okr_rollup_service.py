import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup

_TITLES = ("OKR-A", "OKR-B", "OKR-Closed", "OKR-NoKR")


def _make_okr(title, period, status="Open", krs=None):
	doc = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "OKR",
		"title": title,
		"period": period,
		"owner_user": frappe.session.user,
		"health_status": status,
	})
	for target, current in (krs or []):
		doc.append("key_results", {
			"metric": "M",
			"target_value": target,
			"current_value": current,
			"progress_percent": round((current / target) * 100, 2) if target else 0,
			"unit": "%",
		})
	doc.insert(ignore_permissions=True)
	return doc


def _cleanup():
	for title in _TITLES:
		for n in frappe.get_all("VT Item", {"title": title, "node_type": "OKR"}, ["name"]):
			frappe.delete_doc("VT Item", n["name"], force=True)


class TestOKRRollup(FrappeTestCase):
	def setUp(self):
		_cleanup()
		self.obj_a = _make_okr("OKR-A", "2026-Q2", krs=[(100, 80), (100, 60)])  # avg 70
		self.obj_b = _make_okr("OKR-B", "2026-Q2", krs=[(100, 30)])             # 30
		self.obj_closed = _make_okr("OKR-Closed", "2026-Q2", status="Closed", krs=[(100, 100)])

	def tearDown(self):
		_cleanup()

	def test_excludes_closed(self):
		rows = get_okr_rollup(period="2026-Q2")
		titles = [r["title"] for r in rows]
		self.assertIn("OKR-A", titles)
		self.assertIn("OKR-B", titles)
		self.assertNotIn("OKR-Closed", titles)

	def test_progress_average(self):
		rows = get_okr_rollup(period="2026-Q2")
		a = [r for r in rows if r["title"] == "OKR-A"][0]
		b = [r for r in rows if r["title"] == "OKR-B"][0]
		self.assertAlmostEqual(a["progress"], 70.0)
		self.assertAlmostEqual(b["progress"], 30.0)
		self.assertEqual(a["kr_count"], 2)
		self.assertEqual(b["kr_count"], 1)

	def test_sorted_progress_desc(self):
		rows = get_okr_rollup(period="2026-Q2")
		progress = [r["progress"] for r in rows]
		self.assertEqual(progress, sorted(progress, reverse=True))

	def test_objective_without_kr_returns_zero(self):
		_make_okr("OKR-NoKR", "2026-Q2")
		rows = get_okr_rollup(period="2026-Q2")
		row = [r for r in rows if r["title"] == "OKR-NoKR"][0]
		self.assertEqual(row["progress"], 0.0)
		self.assertEqual(row["kr_count"], 0)
