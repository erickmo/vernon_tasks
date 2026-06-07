import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services.dashboard_aggregator import build_home_payload


def _mk(node_type, title, parent=None, **kw):
	doc = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": node_type,
		"title": title,
		"parent_vt_item": parent,
		**kw,
	})
	doc.insert(ignore_permissions=True)
	return doc


class TestDashboardAggregator(FrappeTestCase):
	def setUp(self):
		self.user = "dash_user@vernon.test"
		if not frappe.db.exists("User", self.user):
			frappe.get_doc({
				"doctype": "User",
				"email": self.user,
				"first_name": "Dash",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)

		# Seed a small VT Item subtree: OKR > Project (owned by user) > Sprint
		# (Active) > Task (assigned to user). This exercises the tree-walking
		# paths (project membership, active sprints, OKR progress) without
		# triggering any risks, so at_risk stays empty.
		self.okr = _mk("OKR", "Dash OKR", health_status="On Track")
		self.okr.append("key_results", {
			"metric": "Signups",
			"target_value": 100,
			"current_value": 40,
			"confidence": 60,
			"confidence_last_week": 50,
		})
		self.okr.save(ignore_permissions=True)

		self.project = _mk(
			"Project", "Dash Project", parent=self.okr.name,
			owner_user=self.user, health_status="On Track", health_score=80,
			end_date=frappe.utils.add_days(frappe.utils.today(), 14),
		)
		self.sprint = _mk(
			"Sprint", "Dash Sprint", parent=self.project.name,
			sprint_state="Active",
			start_date=frappe.utils.today(),
			end_date=frappe.utils.add_days(frappe.utils.today(), 7),
		)
		self.task = _mk(
			"Task", "Dash Task", parent=self.sprint.name,
			owner_user=self.user, pdca_phase="DO",
			kanban_status="In Progress",
			deadline=frappe.utils.add_days(frappe.utils.today(), 3),
			estimated_minutes=120, actual_minutes=30,
		)

	def test_payload_shape_for_ic(self):
		payload = build_home_payload(user=self.user, role="ic")
		self.assertEqual(
			set(payload.keys()),
			{"role", "at_risk", "today", "me", "sprints", "projects"},
		)
		self.assertIn("ontime_rate_7d", payload["today"])
		self.assertIn("blocked_count", payload["today"])
		self.assertIn("okr_confidence_delta_wow", payload["today"])
		self.assertIn("points_week", payload["me"])
		self.assertIn("streak_days", payload["me"])
		self.assertIn("capacity_used_pct", payload["me"])
		self.assertIn("ontime_rate_7d", payload["me"])

	def test_exec_payload_swaps_today_for_org_health(self):
		payload = build_home_payload(user=self.user, role="exec")
		self.assertIn("org_health_score", payload["today"])

	def test_at_risk_list_only_when_triggered(self):
		payload = build_home_payload(user=self.user, role="ic")
		self.assertEqual(payload["at_risk"], [])

	def test_projects_include_owned_project(self):
		payload = build_home_payload(user=self.user, role="ic")
		ids = {p["id"] for p in payload["projects"]}
		self.assertIn(self.project.name, ids)
		mine = next(p for p in payload["projects"] if p["id"] == self.project.name)
		self.assertEqual(mine["my_role"], "owner")
		self.assertEqual(mine["health"], "green")

	def test_active_sprints_include_user_sprint(self):
		payload = build_home_payload(user=self.user, role="ic")
		ids = {s["id"] for s in payload["sprints"]}
		self.assertIn(self.sprint.name, ids)
