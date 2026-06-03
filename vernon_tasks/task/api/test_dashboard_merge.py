"""Tests for the merged POV dashboard API (personal + team aggregators).
Covers: PRD-dashboard-merge, bug-hours-unit. See
docs/superpowers/specs/2026-06-03-dashboard-merge-pov-design.html
"""
import unittest

import frappe
from frappe.utils import today, add_days

from vernon_tasks.task.api import dashboard

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
    existing = frappe.db.get_value("VT Project", {"title": title}, "name")
    if existing:
        return frappe.get_doc("VT Project", existing)
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": title,
        "brand": _ensure_brand(),
        "project_owner": _OWNER,
        "project_leader": leader,
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)


def _make_task(title, project, assigned_to, pdca_phase="PLAN",
               kanban_status="Scheduled", earned_points=0, completion_date=None,
               revision_count=0, deadline=None, actual_minutes=0,
               estimated_minutes=0):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": title,
        "project": project,
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "earned_points": earned_points,
        "completion_date": completion_date,
        "revision_count": revision_count,
        "deadline": deadline,
        "actual_minutes": actual_minutes,
        "estimated_minutes": estimated_minutes,
        "start_date": add_days(today(), -10),
    }).insert(ignore_permissions=True)


class TestPersonalDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _ensure_personal_user()
        # Clean up any leftovers from a prior test run before inserting fixtures.
        for title in ("DM done today", "DM active hrs"):
            for name in frappe.db.get_all("VT Task", {"title": title}, pluck="name"):
                frappe.delete_doc("VT Task", name, force=True, ignore_permissions=True)
        cls.project = _make_project("DM Personal Project").name
        _make_task("DM done today", cls.project, _PERSONAL_USER, pdca_phase="DONE",
                   kanban_status="Done", earned_points=3, completion_date=today())
        _make_task("DM active hrs", cls.project, _PERSONAL_USER, pdca_phase="DO",
                   kanban_status="In Progress", actual_minutes=120,
                   estimated_minutes=180)
        frappe.set_user(_PERSONAL_USER)

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        for title in ("DM done today", "DM active hrs"):
            for name in frappe.db.get_all("VT Task", {"title": title}, pluck="name"):
                frappe.delete_doc("VT Task", name, force=True, ignore_permissions=True)

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
