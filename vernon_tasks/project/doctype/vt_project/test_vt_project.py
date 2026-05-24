import frappe
from frappe.tests.utils import FrappeTestCase

OWNER_EMAIL = "test_proj_owner@example.com"
LEADER_EMAIL = "test_proj_leader@example.com"
MEMBER_EMAIL = "test_proj_member@example.com"
DEFAULT_BRAND = "Default"


def ensure_default_brand():
    if not frappe.db.exists("VT Brand", DEFAULT_BRAND):
        frappe.get_doc({"doctype": "VT Brand", "brand_name": DEFAULT_BRAND}).insert(
            ignore_permissions=True
        )
    return DEFAULT_BRAND


def make_user(email, role):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email,
            "first_name": email.split("@")[0], "last_name": "Test",
            "enabled": 1, "roles": [{"role": role}]
        }).insert(ignore_permissions=True)
    return email


def make_project(**kwargs):
    defaults = {
        "doctype": "VT Project",
        "title": "Test Project",
        "brand": ensure_default_brand(),
        "project_owner": OWNER_EMAIL,
        "project_leader": LEADER_EMAIL,
        "start_date": "2026-05-01",
        "end_date": "2026-05-31",
        "pdca_phase": "PLAN",
        "status": "Open",
    }
    defaults.update(kwargs)
    return frappe.get_doc(defaults)


class TestVTProject(FrappeTestCase):
    def setUp(self):
        make_user(OWNER_EMAIL, "VT Manager")
        make_user(LEADER_EMAIL, "VT Leader")
        make_user(MEMBER_EMAIL, "VT Member")

    def test_create_project(self):
        proj = make_project()
        proj.insert(ignore_permissions=True)
        self.assertTrue(proj.name.startswith("PROJ-"))
        proj.delete()

    def test_end_before_start_raises(self):
        proj = make_project(start_date="2026-05-31", end_date="2026-05-01")
        with self.assertRaises(frappe.ValidationError):
            proj.insert(ignore_permissions=True)

    def test_is_user_leader(self):
        proj = make_project()
        proj.append("team_members", {"user": LEADER_EMAIL, "role": "Leader"})
        proj.insert(ignore_permissions=True)
        from vernon_tasks.project.doctype.vt_project.vt_project import is_user_leader
        self.assertTrue(is_user_leader(proj.name, LEADER_EMAIL))
        self.assertFalse(is_user_leader(proj.name, MEMBER_EMAIL))
        proj.delete()

    def test_is_user_owner(self):
        proj = make_project()
        proj.insert(ignore_permissions=True)
        from vernon_tasks.project.doctype.vt_project.vt_project import is_user_owner
        self.assertTrue(is_user_owner(proj.name, OWNER_EMAIL))
        self.assertFalse(is_user_owner(proj.name, LEADER_EMAIL))
        proj.delete()

    def test_owner_is_implicitly_member(self):
        proj = make_project()
        proj.insert(ignore_permissions=True)
        from vernon_tasks.project.doctype.vt_project.vt_project import is_user_in_project
        self.assertTrue(is_user_in_project(proj.name, OWNER_EMAIL))
        proj.delete()

    def test_pdca_invalid_transition_raises(self):
        proj = make_project(pdca_phase="PLAN")
        proj.insert(ignore_permissions=True)
        proj.pdca_phase = "CHECK"
        with self.assertRaises(frappe.ValidationError):
            proj.save()
        proj.delete()
