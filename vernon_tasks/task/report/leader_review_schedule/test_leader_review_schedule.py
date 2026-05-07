import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.report.leader_review_schedule.leader_review_schedule import execute

OWNER = "test_lrs_owner@example.com"
LEADER = "test_lrs_leader@example.com"
MEMBER = "test_lrs_member@example.com"


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
    proj = frappe.get_doc({
        "doctype": "VT Project",
        "title": "LRS Test Project",
        "project_owner": OWNER,
        "project_leader": LEADER,
        "start_date": "2026-05-01",
        "end_date": "2026-05-31",
        "pdca_phase": "PLAN",
        "status": "Open",
        "team_members": [{"user": MEMBER, "role": "Member"}],
    })
    proj.insert(ignore_permissions=True)
    return proj


def _make_task(proj, review_date, review_hours, phase="CHECK"):
    task = frappe.get_doc({
        "doctype": "VT Task",
        "title": f"LRS Task {review_date}",
        "project": proj.name,
        "assigned_to": MEMBER,
        "priority": "Medium",
        "pdca_phase": phase,
        "kanban_status": "In Progress",
        "estimated_hours": 4.0,
        "start_date": "2026-05-01",
        "deadline": "2026-05-31",
        "review_scheduled_date": review_date,
        "review_estimated_hours": review_hours,
    })
    task.insert(ignore_permissions=True)
    return task


class TestLeaderReviewSchedule(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        _setup_users()
        self.proj = _make_project()
        self.task_a = _make_task(self.proj, "2026-05-12", 2.0)
        self.task_b = _make_task(self.proj, "2026-05-14", 1.5)
        self.task_out = _make_task(self.proj, "2026-05-20", 3.0)  # outside range
        self.task_do = _make_task(self.proj, "2026-05-13", 1.0, phase="DO")  # wrong phase

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
        self.assertEqual(total_row["title"], "Total Review Hours")
        self.assertAlmostEqual(total_row["review_estimated_hours"], 3.5)

    def test_project_filter(self):
        other_proj = _make_project()
        other_task = _make_task(other_proj, "2026-05-12", 5.0)

        columns, data = execute({
            "from_date": "2026-05-12",
            "to_date": "2026-05-15",
            "project": self.proj.name,
        })

        names = [r.get("name") for r in data if r.get("name")]
        self.assertIn(self.task_a.name, names)
        self.assertNotIn(other_task.name, names)

    def test_empty_result_returns_empty_list(self):
        columns, data = execute({"from_date": "2020-01-01", "to_date": "2020-01-07"})

        self.assertEqual(data, [])
