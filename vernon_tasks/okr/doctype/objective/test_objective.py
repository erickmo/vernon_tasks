import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER = "test_okr@example.com"


def create_test_user():
    if not frappe.db.exists("User", TEST_USER):
        frappe.get_doc({
            "doctype": "User", "email": TEST_USER,
            "first_name": "OKR", "last_name": "Test",
            "enabled": 1, "roles": [{"role": "VT Manager"}]
        }).insert(ignore_permissions=True)


class TestObjective(FrappeTestCase):
    def setUp(self):
        create_test_user()

    def _make_objective(self, title="Test Obj", period="2026-Q2", pdca_phase="PLAN"):
        return frappe.get_doc({
            "doctype": "Objective",
            "title": title,
            "period": period,
            "objective_owner": TEST_USER,
            "pdca_phase": pdca_phase,
            "status": "Open",
        })

    def test_create_objective(self):
        doc = self._make_objective()
        doc.insert(ignore_permissions=True)
        self.assertTrue(doc.name.startswith("OBJ-"))
        doc.delete()

    def test_pdca_invalid_transition_raises(self):
        doc = self._make_objective(pdca_phase="PLAN")
        doc.insert(ignore_permissions=True)
        doc.pdca_phase = "CHECK"
        with self.assertRaises(frappe.ValidationError):
            doc.save()
        doc.delete()

    def test_valid_pdca_transition(self):
        doc = self._make_objective(pdca_phase="PLAN")
        doc.insert(ignore_permissions=True)
        doc.pdca_phase = "DO"
        doc.save()
        self.assertEqual(doc.pdca_phase, "DO")
        doc.delete()

    def test_get_progress_no_key_results(self):
        doc = self._make_objective()
        doc.insert(ignore_permissions=True)
        from vernon_tasks.okr.doctype.objective.objective import get_objective_progress
        progress = get_objective_progress(doc.name)
        self.assertEqual(progress, 0.0)
        doc.delete()
