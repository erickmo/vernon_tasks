import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr_mutations as m

TEST_BRAND = "TestBrandMut-Q"
_OKR_TITLE = "BrandMut-Obj"


class TestBrandOkrMutations(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self._cleanup()
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
			ignore_permissions=True)

	def tearDown(self):
		self._cleanup()

	def _cleanup(self):
		# OKR nodes are leaves here (Key Results are child rows, not tree nodes),
		# so a flat delete per node is enough — no descendants to clear first.
		for node in frappe.get_all(
			"VT Item", filters={"node_type": "OKR", "brand": TEST_BRAND}
		):
			frappe.delete_doc("VT Item", node.name, force=True, ignore_permissions=True)
		if frappe.db.exists("VT Brand", TEST_BRAND):
			frappe.delete_doc("VT Brand", TEST_BRAND, force=True, ignore_permissions=True)

	def _make_objective(self, title=_OKR_TITLE):
		"""Insert an OKR-type VT Item node (the parent of Key Result child rows).

		Objective creation now goes through Frappe native quick entry (no
		create_objective endpoint), so these KR tests just need a parent OKR node
		to exist — they insert one via the controller instead of an app endpoint.
		"""
		doc = frappe.get_doc({
			"doctype": "VT Item", "node_type": "OKR", "brand": TEST_BRAND,
			"title": title, "period": "2026-Q3", "owner_user": "Administrator",
		}).insert(ignore_permissions=True)
		return {"id": doc.name}

	def test_create_key_result_returns_id_and_persists_fields(self):
		obj = self._make_objective("KR")
		kr = m.create_key_result(obj["id"], {
			"metric": "Leads", "target_value": 200, "current_value": 50})
		row = frappe.get_doc(m.KEY_RESULT_DOCTYPE, kr["id"])
		self.assertEqual(row.parent, obj["id"])
		self.assertEqual(row.metric, "Leads")
		self.assertEqual(row.target_value, 200)
		self.assertEqual(row.current_value, 50)

	def test_create_key_result_blocks_mass_assignment_of_progress(self):
		"""progress_percent is NOT in the allow-list, so a payload value is dropped
		(legacy intent: the field is controller-computed, never client-set)."""
		obj = self._make_objective("MassAssign")
		kr = m.create_key_result(obj["id"], {
			"metric": "Leads", "target_value": 200, "current_value": 50,
			"progress_percent": 999})  # ignored by the allow-list
		row = frappe.get_doc(m.KEY_RESULT_DOCTYPE, kr["id"])
		self.assertNotEqual(row.progress_percent, 999)

	def test_create_key_result_rejects_unknown_objective(self):
		with self.assertRaises(frappe.DoesNotExistError):
			m.create_key_result("OKR-9999-99999", {
				"metric": "Bad", "target_value": 10})

	def test_get_key_result_returns_editable_fields(self):
		obj = self._make_objective("Get")
		kr = m.create_key_result(obj["id"], {
			"metric": "Signups", "target_value": 80, "current_value": 20,
			"unit": "users", "confidence": 75})
		row = m.get_key_result(kr["id"])
		self.assertEqual(row["name"], kr["id"])
		self.assertEqual(row["objective"], obj["id"])
		self.assertEqual(row["metric"], "Signups")
		self.assertEqual(row["target_value"], 80)
		self.assertEqual(row["current_value"], 20)
		self.assertEqual(row["unit"], "users")
		self.assertEqual(row["confidence"], 75)

	def test_update_key_result_patches_allowed_fields(self):
		obj = self._make_objective("Update")
		kr = m.create_key_result(obj["id"], {
			"metric": "Revenue", "target_value": 100, "current_value": 10})
		res = m.update_key_result(kr["id"], {
			"current_value": 60, "progress_percent": 999})  # progress ignored
		self.assertEqual(res["id"], kr["id"])
		row = frappe.get_doc(m.KEY_RESULT_DOCTYPE, kr["id"])
		self.assertEqual(row.current_value, 60)
		self.assertNotEqual(row.progress_percent, 999)
