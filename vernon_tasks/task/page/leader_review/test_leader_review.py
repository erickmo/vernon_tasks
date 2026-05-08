import frappe
import unittest
from frappe.utils import today, add_days

LEADER_USER = "Administrator"
MEMBER_USER = "test-member@example.com"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Test",
            "last_name": "Member",
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)
    return email


def _make_project(leader, members=None):
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "title": f"Test LR Project - {leader}",
        "project_owner": leader,
        "project_leader": leader,
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
        "team_members": [
            {"user": m, "role": "Member"} for m in (members or [])
        ],
    })
    doc.insert(ignore_permissions=True)
    return doc


def _make_task(name, assigned_to, project, pdca_phase="PLAN", kanban_status="Scheduled",
               priority="Medium", estimated_hours=3.0, deadline_offset=5):
    if frappe.db.exists("VT Task", name):
        frappe.delete_doc("VT Task", name, force=True)
    frappe.flags.in_import = True
    try:
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "name": name,
            "title": f"Task {name}",
            "project": project,
            "assigned_to": assigned_to,
            "pdca_phase": pdca_phase,
            "kanban_status": kanban_status,
            "priority": priority,
            "estimated_hours": estimated_hours,
            "start_date": today(),
            "deadline": add_days(today(), deadline_offset),
            "weight": 3.0,
        }).insert(ignore_permissions=True)
    finally:
        frappe.flags.in_import = False
    return doc


class TestLeaderReviewReadAPIs(unittest.TestCase):

    proj_name = None
    proj2_name = None

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _ensure_user(MEMBER_USER)
        proj = _make_project(LEADER_USER, members=[MEMBER_USER])
        cls.proj_name = proj.name
        # Project NOT led by LEADER_USER (led by Guest)
        proj2 = _make_project("Guest", members=[])
        cls.proj2_name = proj2.name

    @classmethod
    def tearDownClass(cls):
        for name in [cls.proj_name, cls.proj2_name]:
            if name and frappe.db.exists("VT Project", name):
                frappe.delete_doc("VT Project", name, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        for t in ["LR-T1", "LR-T2", "LR-T3", "LR-T4", "LR-BLOCKER", "LR-BLOCKED"]:
            if frappe.db.exists("VT Task", t):
                frappe.delete_doc("VT Task", t, force=True)
        frappe.db.commit()

    # --- get_review_queue ---

    def test_get_review_queue_returns_check_tasks_in_leader_projects(self):
        _make_task("LR-T1", MEMBER_USER, self.proj_name, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertIn("LR-T1", names)

    def test_get_review_queue_excludes_tasks_in_other_projects(self):
        _make_task("LR-T2", MEMBER_USER, self.proj2_name, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T2", names)

    def test_get_review_queue_excludes_non_check_tasks(self):
        _make_task("LR-T3", MEMBER_USER, self.proj_name, pdca_phase="DO", kanban_status="In Progress")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T3", names)

    # --- get_team_workload ---

    def test_get_team_workload_sums_estimated_hours_per_member(self):
        _make_task("LR-T1", MEMBER_USER, self.proj_name, pdca_phase="DO", estimated_hours=4.0)
        _make_task("LR-T2", MEMBER_USER, self.proj_name, pdca_phase="CHECK", estimated_hours=3.0)

        from vernon_tasks.task.page.leader_review.leader_review import get_team_workload
        result = get_team_workload()
        member_row = next((r for r in result if r["assigned_to"] == MEMBER_USER), None)
        self.assertIsNotNone(member_row)
        self.assertAlmostEqual(member_row["total_hours"], 7.0, places=1)

    def test_get_team_workload_excludes_done_and_backlog(self):
        _make_task("LR-T1", MEMBER_USER, self.proj_name, pdca_phase="BACKLOG", estimated_hours=10.0)

        from vernon_tasks.task.page.leader_review.leader_review import get_team_workload
        result = get_team_workload()
        member_row = next((r for r in result if r["assigned_to"] == MEMBER_USER), None)
        if member_row:
            self.assertAlmostEqual(member_row["total_hours"], 0.0, places=1)

    # --- get_team_blocked_tasks ---

    def test_get_team_blocked_tasks_returns_blocked_member_tasks(self):
        _make_task("LR-BLOCKER", LEADER_USER, self.proj_name, pdca_phase="DO")
        frappe.flags.in_import = True
        try:
            frappe.get_doc({
                "doctype": "VT Task",
                "name": "LR-BLOCKED",
                "title": "Blocked Task",
                "project": self.proj_name,
                "assigned_to": MEMBER_USER,
                "pdca_phase": "PLAN",
                "kanban_status": "Scheduled",
                "priority": "High",
                "estimated_hours": 2.0,
                "start_date": today(),
                "deadline": add_days(today(), 3),
                "weight": 2.0,
                "dependencies": [{"blocked_by": "LR-BLOCKER", "dependency_type": "Finish-to-Start"}],
            }).insert(ignore_permissions=True)
        finally:
            frappe.flags.in_import = False

        from vernon_tasks.task.page.leader_review.leader_review import get_team_blocked_tasks
        result = get_team_blocked_tasks()
        names = [r["name"] for r in result]
        self.assertIn("LR-BLOCKED", names)
        row = next(r for r in result if r["name"] == "LR-BLOCKED")
        self.assertEqual(row["blocker_name"], "LR-BLOCKER")
        self.assertIn("days_blocked", row)

    def test_get_team_blocked_tasks_excludes_other_project_tasks(self):
        # Tasks in proj2_name (not led by LEADER_USER) should not appear
        _make_task("LR-T4", MEMBER_USER, self.proj2_name, pdca_phase="PLAN")

        from vernon_tasks.task.page.leader_review.leader_review import get_team_blocked_tasks
        result = get_team_blocked_tasks()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T4", names)
