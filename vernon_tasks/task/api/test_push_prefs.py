import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.push_prefs import get_prefs, update_prefs


class TestPushPrefs(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "push_prefs@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc(
                {"doctype": "User", "email": cls.user, "first_name": cls.user}
            ).insert(ignore_permissions=True)

    def setUp(self):
        name = frappe.db.exists("Vernon Push Preference", {"user": self.user})
        if name:
            frappe.delete_doc("Vernon Push Preference", name, ignore_permissions=True)

    def test_get_prefs_defaults_to_all_on(self):
        frappe.set_user(self.user)
        prefs = get_prefs()
        self.assertEqual(
            prefs,
            {
                "event_assignment": 1,
                "event_mention": 1,
                "event_due": 1,
                "event_review": 1,
            },
        )

    def test_update_creates_row(self):
        frappe.set_user(self.user)
        update_prefs(event_assignment=1, event_mention=0, event_due=1, event_review=0)
        prefs = get_prefs()
        self.assertEqual(prefs["event_mention"], 0)
        self.assertEqual(prefs["event_review"], 0)
        self.assertEqual(prefs["event_assignment"], 1)

    def test_update_modifies_existing(self):
        frappe.set_user(self.user)
        update_prefs(event_mention=0)
        update_prefs(event_mention=1)
        prefs = get_prefs()
        self.assertEqual(prefs["event_mention"], 1)
