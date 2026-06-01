# Tests for onboarding state derivation + dismiss.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.onboarding import get_onboarding_state, dismiss_onboarding

_USER = "onb_state@test.local"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "Onb",
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
        frappe.get_doc("User", email).add_roles("VT Member")
    return email


class TestOnboardingState(FrappeTestCase):
    def setUp(self):
        self.user = _ensure_user(_USER)
        frappe.defaults.clear_default(key="vt_onboarding_dismissed", parent=self.user)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_fresh_user_all_incomplete(self):
        frappe.set_user(self.user)
        state = get_onboarding_state()
        self.assertEqual(state["progress"]["total"], 4)
        keys_done = {s["key"]: s["is_complete"] for s in state["steps"]}
        self.assertFalse(keys_done["buat_proyek"])  # fresh user leads no project
        self.assertTrue(state["show"])

    def test_project_step_completes_with_project(self):
        frappe.set_user("Administrator")
        if not frappe.db.exists("VT Brand", "OnbBrand"):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": "OnbBrand"}).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "VT Project", "title": "Onb Proj", "brand": "OnbBrand",
            "project_owner": self.user, "project_leader": self.user,
            "start_date": "2026-01-01", "end_date": "2026-12-31",
        }).insert(ignore_permissions=True)
        frappe.set_user(self.user)
        state = get_onboarding_state()
        done = {s["key"]: s["is_complete"] for s in state["steps"]}
        self.assertTrue(done["buat_proyek"])

    def test_dismiss_hides_card(self):
        frappe.set_user(self.user)
        dismiss_onboarding()
        self.assertFalse(get_onboarding_state()["show"])
