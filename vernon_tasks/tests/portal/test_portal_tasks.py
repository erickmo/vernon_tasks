import json
import frappe
import unittest
from datetime import date


class _TaskFixturesMixin:
    """Shared fixtures: project + sprint + three tasks, three users."""

    @classmethod
    def _ensure_user(cls, email, role):
        if not frappe.db.exists("User", email):
            user = frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0].title(),
                "send_welcome_email": 0,
                "roles": [{"role": role}],
            }).insert(ignore_permissions=True)
            return user.name
        return email

    @classmethod
    def _ensure_project(cls, title="Test Proj P3.3"):
        if not frappe.db.exists("VT Project", {"title": title}):
            return frappe.get_doc({
                "doctype": "VT Project",
                "title": title,
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 12, 31),
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name
        return frappe.db.get_value("VT Project", {"title": title}, "name")

    @classmethod
    def _ensure_sprint(cls, project, title, status="Active"):
        existing = frappe.db.exists("VT Sprint", {"sprint_title": title, "project": project})
        if existing:
            return existing
        return frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": title,
            "project": project,
            "start_date": date(2026, 5, 1),
            "end_date": date(2026, 5, 31),
            "status": status,
            "goal": "",
        }).insert(ignore_permissions=True).name

    @classmethod
    def _ensure_task(cls, title, project, sprint, assigned_to):
        existing = frappe.db.exists("VT Task", {"title": title, "sprint": sprint})
        if existing:
            return existing
        return frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "project": project,
            "sprint": sprint,
            "kanban_status": "Backlog",
            "pdca_phase": "BACKLOG",
            "estimated_hours": 2.0,
            "priority": "Medium",
            "assigned_to": assigned_to,
        }).insert(ignore_permissions=True).name

    @classmethod
    def _setup_common_fixtures(cls, sprint_name):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls.member_other = "member_other_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls._ensure_user(cls.member_other, "VT Member")
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, sprint_name)


class TestGetTaskDetail(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls._setup_common_fixtures("SP-detail-p33")
        cls.task = cls._ensure_task("Task detail test", cls.project, cls.sprint, cls.member_owner)

    def test_manager_gets_full_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        result = get_task_detail(self.task)
        self.assertIn("task", result)
        self.assertIn("permitted_fields", result)
        expected = {"title", "deadline", "assigned_to", "kanban_status", "priority", "estimated_hours", "pdca_phase"}
        self.assertEqual(set(result["permitted_fields"]), expected)

    def test_task_shape_has_required_keys(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        result = get_task_detail(self.task)
        t = result["task"]
        for key in ("name", "title", "kanban_status", "pdca_phase", "priority",
                    "estimated_hours", "sprint", "project", "assigned_to",
                    "deadline", "completion_date", "base_points", "kanban_rank"):
            self.assertIn(key, t, f"missing key: {key}")

    def test_member_own_task_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.member_owner)
        result = get_task_detail(self.task)
        self.assertEqual(set(result["permitted_fields"]), {"title", "kanban_status", "pdca_phase"})

    def test_member_other_task_no_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.member_other)
        result = get_task_detail(self.task)
        self.assertEqual(result["permitted_fields"], [])

    def test_nonexistent_task_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            get_task_detail("VT-TASK-DOES-NOT-EXIST-99999")


class TestUpdateTask(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls._setup_common_fixtures("SP-update-p33")
        cls.task = cls._ensure_task("Task update test", cls.project, cls.sprint, cls.member_owner)

    def test_manager_can_update_all_mutable_fields(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        result = update_task(self.task, json.dumps({"title": "Updated by manager", "priority": "High", "estimated_hours": 3.0}))
        self.assertEqual(result["task"]["title"], "Updated by manager")
        self.assertEqual(result["task"]["priority"], "High")

    def test_member_can_update_own_task_title_status_pdca(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        result = update_task(self.task, json.dumps({"title": "Member updated title", "kanban_status": "Scheduled", "pdca_phase": "PLAN"}))
        self.assertEqual(result["task"]["title"], "Member updated title")

    def test_member_cannot_update_priority(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"priority": "Critical"}))

    def test_member_cannot_update_estimated_hours(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"estimated_hours": 10.0}))

    def test_member_cannot_update_assigned_to(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"assigned_to": self.member_other}))

    def test_member_cannot_update_deadline(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"deadline": "2026-12-31"}))

    def test_member_cannot_update_other_users_task(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_other)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"title": "Hacked"}))

    def test_done_status_sets_completion_date(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        # Reset completion_date first so this test is deterministic
        frappe.db.set_value("VT Task", self.task, "completion_date", None)
        result = update_task(self.task, json.dumps({"kanban_status": "Done"}))
        self.assertIsNotNone(result["task"]["completion_date"])

    def test_empty_title_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            update_task(self.task, json.dumps({"title": "   "}))

    def test_done_status_does_not_overwrite_existing_completion_date(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        existing_date = "2026-01-15"
        frappe.db.set_value("VT Task", self.task, "completion_date", existing_date)
        result = update_task(self.task, json.dumps({"kanban_status": "Done"}))
        self.assertEqual(result["task"]["completion_date"], existing_date)

    def test_update_kanban_status_syncs_pdca_phase(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        result = update_task(self.task, json.dumps({"kanban_status": "In Progress"}))
        self.assertEqual(result["task"]["pdca_phase"], "DO")


class TestCreateTask(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls.project = cls._ensure_project()
        cls.active_sprint = cls._ensure_sprint(cls.project, "SP-create-active-p33", "Active")
        cls.planning_sprint = cls._ensure_sprint(cls.project, "SP-create-planning-p33", "Planning")

    def test_manager_can_create_task(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Created by manager",
            "priority": "High",
            "estimated_hours": 3.0,
        }))
        self.assertIn("name", result)
        self.assertIn("task", result)
        self.assertEqual(result["task"]["title"], "Created by manager")
        self.assertEqual(result["task"]["priority"], "High")
        self.assertIsNone(result["task"]["kanban_rank"])

    def test_member_can_create_in_active_sprint(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.member_owner)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Member active task",
        }))
        self.assertIn("name", result)
        self.assertEqual(result["task"]["assigned_to"], self.member_owner)

    def test_member_cannot_create_in_planning_sprint(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            create_task(json.dumps({
                "sprint": self.planning_sprint,
                "project": self.project,
                "title": "Should fail",
            }))

    def test_missing_title_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            create_task(json.dumps({
                "sprint": self.active_sprint,
                "project": self.project,
                "title": "",
            }))

    def test_returned_shape_matches_task_card_data(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Shape test task",
        }))
        for key in ("name", "title", "assigned_to", "kanban_status", "pdca_phase",
                    "kanban_rank", "estimated_hours", "priority", "deadline"):
            self.assertIn(key, result["task"], f"missing key: {key}")


class TestTaskComments(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls.member_other = "member_other_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls._ensure_user(cls.member_other, "VT Member")
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "SP-comments-p33")
        cls.task = cls._ensure_task(
            "Task comments test", cls.project, cls.sprint, cls.member_owner
        )

    def test_empty_task_returns_empty_list(self):
        from vernon_tasks.api.portal_tasks import get_task_comments
        task2 = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Empty comments task",
            "project": self.project,
            "sprint": self.sprint,
            "kanban_status": "Backlog",
            "pdca_phase": "BACKLOG",
            "assigned_to": self.member_owner,
        }).insert(ignore_permissions=True).name
        frappe.set_user(self.manager)
        result = get_task_comments(task2)
        self.assertEqual(result, [])

    def test_add_comment_inserts_and_returns_entry(self):
        from vernon_tasks.api.portal_tasks import add_comment
        frappe.set_user(self.member_owner)
        result = add_comment(self.task, "<p>Hello from member</p>")
        self.assertEqual(result["type"], "comment")
        self.assertIn("name", result)
        self.assertEqual(result["owner"], self.member_owner)
        self.assertIn("creation", result)
        self.assertEqual(result["comment_type"], "Comment")

    def test_add_comment_empty_content_raises(self):
        from vernon_tasks.api.portal_tasks import add_comment
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.ValidationError):
            add_comment(self.task, "   ")

    def test_get_task_comments_returns_merged_sorted_list(self):
        from vernon_tasks.api.portal_tasks import add_comment, get_task_comments
        frappe.set_user(self.member_owner)
        add_comment(self.task, "<p>First</p>")
        frappe.set_user(self.manager)
        add_comment(self.task, "<p>Second</p>")
        result = get_task_comments(self.task)
        for entry in result:
            self.assertIn("type", entry)
            self.assertIn(entry["type"], ("comment", "version"))
        comment_contents = [e["content"] for e in result if e["type"] == "comment"]
        self.assertIn("<p>First</p>", comment_contents)
        self.assertIn("<p>Second</p>", comment_contents)
        creations = [e["creation"] for e in result]
        self.assertEqual(creations, sorted(creations))

    def test_version_entries_only_include_tracked_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_comments
        import json as _json
        v_doc = frappe.get_doc({
            "doctype": "Version",
            "ref_doctype": "VT Task",
            "docname": self.task,
            "data": _json.dumps({
                "changed": [
                    ["kanban_status", "Backlog", "In Progress"],
                    ["some_untracked_field", "old", "new"],
                ]
            }),
        }).insert(ignore_permissions=True)
        frappe.set_user(self.manager)
        result = get_task_comments(self.task)
        version_entries = [e for e in result if e["type"] == "version"]
        our_version = next((v for v in version_entries if v["name"] == v_doc.name), None)
        self.assertIsNotNone(our_version)
        fields_in_changes = [c[0] for c in our_version["changes"]]
        self.assertIn("kanban_status", fields_in_changes)
        self.assertNotIn("some_untracked_field", fields_in_changes)

    def test_owner_can_delete_own_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.member_owner)
        new_comment = add_comment(self.task, "<p>To delete</p>")
        result = delete_comment(new_comment["name"])
        self.assertTrue(result["ok"])
        self.assertFalse(frappe.db.exists("Comment", new_comment["name"]))

    def test_manager_can_delete_any_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.member_owner)
        new_comment = add_comment(self.task, "<p>Manager will delete this</p>")
        frappe.set_user(self.manager)
        result = delete_comment(new_comment["name"])
        self.assertTrue(result["ok"])

    def test_member_cannot_delete_others_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.manager)
        new_comment = add_comment(self.task, "<p>Manager comment</p>")
        frappe.set_user(self.member_other)
        with self.assertRaises(frappe.PermissionError):
            delete_comment(new_comment["name"])
