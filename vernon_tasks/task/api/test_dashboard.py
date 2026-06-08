import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api.dashboard import (
	_calc_risk,
	me_progress,
	my_projects,
	project_detail,
	project_sprints,
	schedule_agenda,
)

# VT Item tree migration: Project / Sprint / Task are node_type values on the
# single VT Item nested-set tree. Tasks live under the Project (or a Sprint)
# via parent_vt_item — the legacy VT Task.project / VT Task.sprint / VT
# Sprint.project Link fields are gone. Field renames: assigned_to/project_owner
# →owner_user, project_leader→leader_user, Project status→health_status, Sprint
# status→sprint_state, done phase DONE→CLOSED. kanban_status is derived from
# pdca_phase by the controller; only "Blocked" is set directly.
_FIXTURE_PROJECT_TITLE = "TEST-DASHBOARD-PROJ"
_FIXTURE_BRAND = "TEST-DASHBOARD-BRAND"


def _ensure_brand():
	# VT Item.brand links to VT Brand (a real doctype, not part of the merge).
	if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
		frappe.get_doc({
			"doctype": "VT Brand",
			"brand_name": _FIXTURE_BRAND,
		}).insert(ignore_permissions=True)
	return _FIXTURE_BRAND


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
	return email


def _cleanup_projects():
	# NestedSet blocks deleting a parent before its children, so delete each
	# fixture project's whole subtree deepest-first (highest lft) then the root.
	for proj in frappe.get_all(
		"VT Item",
		{"title": _FIXTURE_PROJECT_TITLE, "node_type": "Project"},
		["name", "lft", "rgt"],
	):
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True)
		frappe.delete_doc("VT Item", proj["name"], force=True)


class TestDashboard(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.user_a = _ensure_user("a-dash@test.local")
		_cleanup_projects()
		self.project = self._make_project(self.user_a)

	def tearDown(self):
		frappe.set_user("Administrator")
		_cleanup_projects()

	def _make_project(self, owner):
		doc = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": _FIXTURE_PROJECT_TITLE,
			"brand": _ensure_brand(),
			"owner_user": owner,
			"leader_user": owner,
			"health_status": "Open",
			"start_date": "2025-01-01",
			"end_date": "2025-12-31",
		})
		doc.insert(ignore_permissions=True)
		return doc.name

	def _make_task(self, owner, deadline, status="Backlog", points=3, title="T"):
		# kanban_status is controller-derived from pdca_phase; only the seed of an
		# explicitly-Blocked card is set directly. "Done" maps to phase CLOSED.
		data = {
			"doctype": "VT Item",
			"node_type": "Task",
			"title": title,
			"deadline": deadline,
			"owner_user": owner,
			"parent_vt_item": self.project,
			"base_points": points,
		}
		if status == "Done":
			data["pdca_phase"] = "CLOSED"
		doc = frappe.get_doc(data)
		if status == "Blocked":
			doc.kanban_status = "Blocked"
		doc.flags.ignore_links = True
		return doc.insert(ignore_permissions=True)

	# ── _calc_risk ──
	def test_calc_risk_behind(self):
		self.assertEqual(_calc_risk(40.0, 70.0), "behind")

	def test_calc_risk_on_track_when_early(self):
		self.assertEqual(_calc_risk(20.0, 30.0), "on_track")

	def test_calc_risk_boundary(self):
		# elapsed = 60 (not > 60) → on_track
		self.assertEqual(_calc_risk(40.0, 60.0), "on_track")

	# ── me_progress ──
	def test_me_progress_keys(self):
		frappe.set_user(self.user_a)
		result = me_progress()
		for key in ("velocity", "velocity_delta", "sprint", "workload", "next_actions"):
			self.assertIn(key, result)
		self.assertEqual(len(result["velocity"]), 8)
		for k in ("open", "overdue", "due_soon"):
			self.assertIn(k, result["workload"])

	def test_me_progress_workload_overdue(self):
		frappe.set_user("Administrator")
		today = frappe.utils.today()
		self._make_task(self.user_a, frappe.utils.add_days(today, -3), title="late")
		self._make_task(self.user_a, frappe.utils.add_days(today, 1), title="soon")
		frappe.set_user(self.user_a)
		result = me_progress()
		self.assertGreaterEqual(result["workload"]["overdue"], 1)
		self.assertGreaterEqual(result["workload"]["due_soon"], 1)
		self.assertGreaterEqual(len(result["next_actions"]), 2)

	# ── my_projects ──
	def test_my_projects_returns_shape(self):
		frappe.set_user(self.user_a)
		result = my_projects()
		for key in ("is_admin", "led", "member"):
			self.assertIn(key, result)
		self.assertIsInstance(result["led"], list)
		self.assertIsInstance(result["member"], list)

	def test_my_projects_filter_led(self):
		frappe.set_user(self.user_a)
		result = my_projects(filter="led")
		self.assertEqual(result["member"], [])

	# ── project_detail ──
	def test_project_detail_shape(self):
		frappe.set_user("Administrator")
		self._make_task(self.user_a, frappe.utils.today(), title="open task")
		frappe.set_user(self.user_a)
		result = project_detail(self.project)
		for key in ("header", "open_tasks", "team_members", "milestones", "blockers"):
			self.assertIn(key, result)
		self.assertEqual(result["header"]["id"], self.project)
		self.assertIsInstance(result["open_tasks"], list)
		self.assertGreaterEqual(len(result["open_tasks"]), 1)

	def test_project_detail_counts(self):
		frappe.set_user("Administrator")
		self._make_task(self.user_a, frappe.utils.today(), title="open")
		done = self._make_task(self.user_a, frappe.utils.today(), title="done")
		# kanban_status is controller-derived from pdca_phase; walk the legal
		# PDCA chain to the terminal CLOSED phase (direct BACKLOG→CLOSED is
		# rejected by the controller's transition guard).
		for phase in ("PLAN", "DO", "CHECK", "CLOSED"):
			done.pdca_phase = phase
			done.save(ignore_permissions=True)
		frappe.set_user(self.user_a)
		counts = project_detail(self.project)["counts"]
		for key in ("total", "open", "done"):
			self.assertIn(key, counts)
		self.assertGreaterEqual(counts["total"], 2)
		self.assertGreaterEqual(counts["done"], 1)
		self.assertGreaterEqual(counts["open"], 1)

	def test_project_detail_card_has_start_date(self):
		frappe.set_user("Administrator")
		self._make_task(self.user_a, frappe.utils.today(), title="dated")
		frappe.set_user(self.user_a)
		card = project_detail(self.project)["open_tasks"][0]
		self.assertIn("start_date", card)

	def test_project_detail_card_overdue_flag(self):
		"""overdue:bool is server-computed (site-tz) — drives the Fokus feed
		Terlambat / Jatuh Tempo buckets. Compared via getdate(today()) both sides
		so it never drifts with the browser timezone."""
		frappe.set_user("Administrator")
		today = frappe.utils.today()
		self._make_task(self.user_a, frappe.utils.add_days(today, -2), title="late")
		self._make_task(self.user_a, today, title="due today")
		self._make_task(self.user_a, frappe.utils.add_days(today, 5), title="future")
		frappe.set_user(self.user_a)
		cards = {c["title"]: c for c in project_detail(self.project)["open_tasks"]}
		self.assertIn("overdue", cards["late"])
		self.assertTrue(cards["late"]["overdue"])
		self.assertFalse(cards["due today"]["overdue"])  # due today is NOT overdue
		self.assertFalse(cards["future"]["overdue"])
		# due_today is server-computed (site-tz) too, so the feed bucket never
		# drifts with the browser clock.
		self.assertTrue(cards["due today"]["due_today"])
		self.assertFalse(cards["late"]["due_today"])
		self.assertFalse(cards["future"]["due_today"])

	def test_project_detail_forbidden(self):
		# A user with no access to the project must be rejected.
		outsider = _ensure_user("outsider-dash@test.local")
		frappe.set_user(outsider)
		with self.assertRaises(frappe.PermissionError):
			project_detail(self.project)

	def _make_sprint(self, title):
		return frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Sprint",
			"title": title,
			"parent_vt_item": self.project,
			"start_date": "2025-01-01",
			"end_date": "2025-01-14",
			"sprint_state": "Active",
		}).insert(ignore_permissions=True)

	# ── project_sprints ──
	def test_project_sprints_shape(self):
		frappe.set_user(self.user_a)
		result = project_sprints(self.project)
		for key in ("sprints", "unassigned"):
			self.assertIn(key, result)
		self.assertIsInstance(result["sprints"], list)
		self.assertIsInstance(result["unassigned"], list)

	def test_project_sprints_buckets_tasks(self):
		frappe.set_user("Administrator")
		sprint = self._make_sprint("Sprint Bucket Test")
		# A Task's sprint is now its tree parent: re-home the seeded task under
		# the Sprint node (the old VT Task.sprint Link is gone).
		in_sprint = self._make_task(self.user_a, frappe.utils.today(), title="in sprint")
		in_sprint.parent_vt_item = sprint.name
		in_sprint.save(ignore_permissions=True)
		self._make_task(self.user_a, frappe.utils.today(), title="no sprint")
		frappe.set_user(self.user_a)
		result = project_sprints(self.project)
		bucket = next(s for s in result["sprints"] if s["id"] == sprint.name)
		self.assertEqual([t["title"] for t in bucket["tasks"]], ["in sprint"])
		self.assertIn("no sprint", [t["title"] for t in result["unassigned"]])

	def test_project_sprints_forbidden(self):
		outsider = _ensure_user("outsider-dash@test.local")
		frappe.set_user(outsider)
		with self.assertRaises(frappe.PermissionError):
			project_sprints(self.project)

	# ── schedule_agenda ──
	def test_schedule_agenda_shape(self):
		frappe.set_user(self.user_a)
		result = schedule_agenda()
		for key in ("today_summary", "days"):
			self.assertIn(key, result)
		for k in ("tasks", "meetings", "sprint_events"):
			self.assertIn(k, result["today_summary"])

	def test_schedule_agenda_window_includes_today(self):
		frappe.set_user("Administrator")
		today = frappe.utils.today()
		self._make_task(self.user_a, today, title="due today")
		frappe.set_user(self.user_a)
		result = schedule_agenda()
		self.assertGreaterEqual(result["today_summary"]["tasks"], 1)
		first = result["days"][0] if result["days"] else None
		self.assertIsNotNone(first)
		self.assertEqual(first["label"], "Today")
