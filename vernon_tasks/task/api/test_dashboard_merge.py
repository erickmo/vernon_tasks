"""Tests for the merged POV dashboard API (personal + team aggregators).
Covers: PRD-dashboard-merge, bug-hours-unit. See
docs/superpowers/specs/2026-06-03-dashboard-merge-pov-design.html

VT Item tree migration (P4): Project / Task are `node_type` values on the
single VT Item nested-set tree (was the dead VT Project / VT Task doctypes).
Field renames: project_owner/assigned_to → owner_user, project_leader →
leader_user, Project status → health_status. A Task's project is its parent
node (here Tasks sit directly under their Project — the allowed backlog skip).
Done tasks use pdca_phase="CLOSED" (legacy "DONE"); kanban_status is derived by
the controller from pdca_phase, so seeds never set it directly. Reads still go
through vernon_tasks.task.api.dashboard, which targets the VT Item tree.
"""
import unittest

import frappe
from frappe.utils import today, add_days

from vernon_tasks.task.api import dashboard

# All Project / Task seeds target the unified VT Item tree doctype.
_ITEM_DOCTYPE = "VT Item"
_PROJECT_NODE_TYPE = "Project"
_TASK_NODE_TYPE = "Task"
# Unified terminal task phase (legacy VT Task "DONE"); controller derives the
# "Done" kanban column from it, so we never set kanban_status directly.
_DONE_PHASE = "CLOSED"
# Active phase for in-progress / overdue fixtures.
_DO_PHASE = "DO"

_BRAND = "TEST-DM-BRAND"
_OWNER = "Administrator"
_PERSONAL_USER = "test-dm-personal@example.com"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _BRAND):
        frappe.get_doc({"doctype": "VT Brand", "brand_name": _BRAND}).insert(
            ignore_permissions=True
        )
    return _BRAND


def _ensure_personal_user():
    if not frappe.db.exists("User", _PERSONAL_USER):
        frappe.get_doc({
            "doctype": "User",
            "email": _PERSONAL_USER,
            "first_name": "DMPersonal",
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)
    return _PERSONAL_USER


def _make_project(title, leader=None):
    """Seed (or reuse) a Project VT Item node. project_owner → owner_user,
    project_leader → leader_user, status → health_status."""
    existing = frappe.db.get_value(
        _ITEM_DOCTYPE, {"title": title, "node_type": _PROJECT_NODE_TYPE}, "name"
    )
    if existing:
        return frappe.get_doc(_ITEM_DOCTYPE, existing)
    return frappe.get_doc({
        "doctype": _ITEM_DOCTYPE,
        "node_type": _PROJECT_NODE_TYPE,
        "parent_vt_item": None,
        "title": title,
        "brand": _ensure_brand(),
        "owner_user": _OWNER,
        "leader_user": leader,
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)


def _make_task(title, project, assigned_to, pdca_phase="PLAN",
               earned_points=0, completion_date=None,
               revision_count=0, deadline=None, actual_minutes=0,
               estimated_minutes=0):
    """Seed a Task VT Item node directly under its Project (allowed backlog
    skip). assigned_to → owner_user; a Task's project is its parent node, not a
    `project` Link. kanban_status is intentionally NOT set: the controller
    derives it from pdca_phase (CLOSED → Done, DO → In Progress, …)."""
    return frappe.get_doc({
        "doctype": _ITEM_DOCTYPE,
        "node_type": _TASK_NODE_TYPE,
        "parent_vt_item": project,
        "title": title,
        "owner_user": assigned_to,
        "pdca_phase": pdca_phase,
        "earned_points": earned_points,
        "completion_date": completion_date,
        "revision_count": revision_count,
        "deadline": deadline,
        "actual_minutes": actual_minutes,
        "estimated_minutes": estimated_minutes,
        "start_date": add_days(today(), -10),
    }).insert(ignore_permissions=True)


def _delete_tasks_by_title(*titles):
    """Delete Task nodes by title. Tasks are leaves here (no children), so the
    nested set lets them go before their parent Project."""
    for title in titles:
        for name in frappe.db.get_all(
            _ITEM_DOCTYPE, {"title": title, "node_type": _TASK_NODE_TYPE},
            pluck="name",
        ):
            frappe.delete_doc(_ITEM_DOCTYPE, name, force=True, ignore_permissions=True)


def _delete_project_subtree(*titles):
    """Delete each named Project plus its whole subtree. NestedSet blocks
    deleting a parent before its children, so remove descendants deepest-first
    (highest lft) and then the Project root."""
    for title in titles:
        for proj in frappe.db.get_all(
            _ITEM_DOCTYPE, {"title": title, "node_type": _PROJECT_NODE_TYPE},
            ["name", "lft", "rgt"],
        ):
            for d in frappe.db.get_all(
                _ITEM_DOCTYPE,
                filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
                fields=["name"], order_by="lft desc",
            ):
                frappe.delete_doc(_ITEM_DOCTYPE, d["name"], force=True,
                                  ignore_permissions=True)
            frappe.delete_doc(_ITEM_DOCTYPE, proj["name"], force=True,
                              ignore_permissions=True)


class TestPersonalDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _ensure_personal_user()
        # Clean up any leftovers from a prior test run before inserting fixtures.
        _delete_tasks_by_title("DM done today", "DM active hrs")
        _delete_project_subtree("DM Personal Project")
        cls.project = _make_project("DM Personal Project").name
        _make_task("DM done today", cls.project, _PERSONAL_USER, pdca_phase=_DONE_PHASE,
                   earned_points=3, completion_date=today())
        _make_task("DM active hrs", cls.project, _PERSONAL_USER, pdca_phase=_DO_PHASE,
                   actual_minutes=120, estimated_minutes=180)
        frappe.set_user(_PERSONAL_USER)

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        _delete_tasks_by_title("DM done today", "DM active hrs")
        _delete_project_subtree("DM Personal Project")

    def test_personal_stats_counts_done_today(self):
        out = dashboard.personal_stats()
        self.assertGreaterEqual(out["done_today"], 1)
        self.assertIn("points_month", out)
        self.assertIn("blocked", out)

    def test_daily_completions_zero_filled_seven_days(self):
        out = dashboard.daily_completions()
        self.assertEqual(len(out), 7)
        self.assertTrue(all("date" in r and "count" in r for r in out))

    def test_hours_summary_returns_hours_not_minutes(self):
        out = dashboard.hours_summary()
        # actual_minutes=120 -> 2.0h logged; remaining (180-120)=60min -> 1.0h
        self.assertEqual(out["logged_hours"], 2.0)
        self.assertEqual(out["remaining_hours"], 1.0)
        self.assertNotIn("actual_minutes", out)


def _ensure_user(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": email.split("@")[0],
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)
    user = frappe.get_doc("User", email)
    user.add_roles(*roles)
    return email


class TestTeamDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls.leader = _ensure_user("dm_leader@test.local", ["VT Leader", "VT Member"])
        cls.manager = _ensure_user("dm_manager@test.local", ["VT Manager", "VT Member"])
        cls.plain = _ensure_user("dm_plain@test.local", ["VT Member"])
        # Clean any leftovers before seeding so reruns stay deterministic.
        _delete_tasks_by_title("DM led overdue", "DM other overdue")
        _delete_project_subtree("DM Led Project", "DM Other Project")
        # Led project (leader is leader_user) + a foreign project the leader does
        # NOT lead — used to prove led-scope filtering.
        cls.led = _make_project("DM Led Project", leader=cls.leader).name
        cls.other = _make_project("DM Other Project").name
        _make_task("DM led overdue", cls.led, cls.leader, pdca_phase=_DO_PHASE,
                   deadline=add_days(today(), -2))
        _make_task("DM other overdue", cls.other, cls.manager, pdca_phase=_DO_PHASE,
                   deadline=add_days(today(), -2))

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        _delete_tasks_by_title("DM led overdue", "DM other overdue")
        _delete_project_subtree("DM Led Project", "DM Other Project")

    def test_tab_state_plain_member_not_visible(self):
        frappe.set_user(self.plain)
        try:
            st = dashboard.team_tab_state()
            self.assertFalse(st["visible"])
        finally:
            frappe.set_user("Administrator")

    def test_tab_state_leader_led_scope(self):
        frappe.set_user(self.leader)
        try:
            st = dashboard.team_tab_state()
            self.assertTrue(st["visible"])
            self.assertEqual(st["scope"], "led")
            self.assertGreaterEqual(st["led_count"], 1)
        finally:
            frappe.set_user("Administrator")

    def test_tab_state_manager_global_scope(self):
        frappe.set_user(self.manager)
        try:
            st = dashboard.team_tab_state()
            self.assertTrue(st["visible"])
            self.assertEqual(st["scope"], "global")
        finally:
            frappe.set_user("Administrator")

    def test_overview_led_scope_excludes_foreign_projects(self):
        frappe.set_user(self.leader)
        try:
            data = dashboard.team_overview()
            self.assertEqual(data["scope"], "led")
            titles = {o["task_title"] for o in data["overdue"]}
            self.assertIn("DM led overdue", titles)
            self.assertNotIn("DM other overdue", titles)
        finally:
            frappe.set_user("Administrator")

    def test_overview_manager_global_includes_all(self):
        frappe.set_user(self.manager)
        try:
            data = dashboard.team_overview()
            self.assertEqual(data["scope"], "global")
            titles = {o["task_title"] for o in data["overdue"]}
            self.assertIn("DM led overdue", titles)
            self.assertIn("DM other overdue", titles)
        finally:
            frappe.set_user("Administrator")

    def test_overview_denied_for_plain_member(self):
        frappe.set_user(self.plain)
        try:
            with self.assertRaises(frappe.PermissionError):
                dashboard.team_overview()
        finally:
            frappe.set_user("Administrator")
