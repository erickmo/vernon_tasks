import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.report.leader_review_schedule.leader_review_schedule import execute

OWNER = "test_lrs_owner@example.com"
LEADER = "test_lrs_leader@example.com"
MEMBER = "test_lrs_member@example.com"
_FIXTURE_BRAND = "TEST-LRS-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _setup_users():
    for email, role in [
        (OWNER, "VT Manager"),
        (LEADER, "VT Leader"),
        (MEMBER, "VT Member"),
    ]:
        if not frappe.db.exists("User", email):
            frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0],
                "last_name": "LRS",
                "enabled": 1,
                "roles": [{"role": role}],
            }).insert(ignore_permissions=True)


def _make_project():
    # Project is a VT Item node (node_type="Project"); project_owner/
    # project_leader renamed to owner_user/leader_user, status -> health_status.
    proj = frappe.get_doc({
        "doctype": "VT Item",
        "node_type": "Project",
        "title": "LRS Test Project",
        "brand": _ensure_brand(),
        "owner_user": OWNER,
        "leader_user": LEADER,
        "start_date": "2026-05-01",
        "end_date": "2026-05-31",
        "pdca_phase": "PLAN",
        "health_status": "Open",
        "team_members": [{"user": MEMBER, "role": "Member"}],
    })
    proj.insert(ignore_permissions=True)
    return proj


def _make_task(proj, review_date, review_hours, phase="CHECK"):
    # Task is a VT Item node (node_type="Task") sitting directly under its
    # project via parent_vt_item; assigned_to renamed to owner_user.
    task = frappe.get_doc({
        "doctype": "VT Item",
        "node_type": "Task",
        "title": f"LRS Task {review_date}",
        "parent_vt_item": proj.name,
        "owner_user": MEMBER,
        "priority": "Medium",
        "pdca_phase": phase,
        "kanban_status": "In Progress",
        "estimated_minutes": 4.0,
        "start_date": "2026-05-01",
        "deadline": "2026-05-31",
        "review_scheduled_date": review_date,
        "review_estimated_minutes": review_hours,
    })
    task.insert(ignore_permissions=True)
    return task


class TestLeaderReviewSchedule(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        _setup_users()
        self.proj = _make_project()
        self.task_a = _make_task(self.proj, "2026-05-12", 120)
        self.task_b = _make_task(self.proj, "2026-05-14", 90)
        self.task_out = _make_task(self.proj, "2026-05-20", 180)  # outside range
        self.task_do = _make_task(self.proj, "2026-05-13", 60, phase="DO")  # wrong phase

    def tearDown(self):
        frappe.db.rollback()

    def test_returns_only_check_phase_tasks(self):
        columns, data = execute({"from_date": "2026-05-12", "to_date": "2026-05-15"})

        names = [r.get("name") for r in data if r.get("name")]
        self.assertIn(self.task_a.name, names)
        self.assertIn(self.task_b.name, names)
        self.assertNotIn(self.task_do.name, names)

    def test_excludes_tasks_outside_date_range(self):
        columns, data = execute({"from_date": "2026-05-12", "to_date": "2026-05-15"})

        names = [r.get("name") for r in data if r.get("name")]
        self.assertNotIn(self.task_out.name, names)

    def test_total_row_sums_hours(self):
        columns, data = execute({"from_date": "2026-05-12", "to_date": "2026-05-15"})

        total_row = next((r for r in data if r.get("is_grand_total")), None)
        self.assertIsNotNone(total_row)
        self.assertEqual(total_row["title"], "Total Review Minutes")
        self.assertEqual(total_row["review_estimated_minutes"], 210)

    def test_project_filter(self):
        other_proj = _make_project()
        other_task = _make_task(other_proj, "2026-05-12", 300)

        columns, data = execute({
            "from_date": "2026-05-12",
            "to_date": "2026-05-15",
            "project": self.proj.name,
        })

        names = [r.get("name") for r in data if r.get("name")]
        self.assertIn(self.task_a.name, names)
        self.assertNotIn(other_task.name, names)

    def test_resolves_project_from_tree(self):
        columns, data = execute({"from_date": "2026-05-12", "to_date": "2026-05-15"})

        row_a = next((r for r in data if r.get("name") == self.task_a.name), None)
        self.assertIsNotNone(row_a)
        self.assertEqual(row_a["project"], self.proj.name)
        self.assertEqual(row_a["assigned_to"], MEMBER)

    def test_empty_result_returns_empty_list(self):
        columns, data = execute({"from_date": "2020-01-01", "to_date": "2020-01-07"})

        self.assertEqual(data, [])
