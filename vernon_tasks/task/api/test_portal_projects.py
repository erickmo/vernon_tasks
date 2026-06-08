import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.api import portal_projects

# Seed marker reused by every test so cleanup is deterministic.
_PROJ_TITLE = "PORTAL-PROJ-API-Test"
_BRAND_NAME = "PORTAL-PROJ-API-Brand"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", _BRAND_NAME):
		frappe.get_doc(
			{"doctype": "VT Brand", "brand_name": _BRAND_NAME}
		).insert(ignore_permissions=True)
	return _BRAND_NAME


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for proj in frappe.get_all(
		"VT Item",
		{"title": _PROJ_TITLE, "node_type": "Project"},
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


def _make_project(**overrides):
	data = {
		"doctype": "VT Item",
		"node_type": "Project",
		"title": _PROJ_TITLE,
		"start_date": add_days(today(), -5),
		"end_date": add_days(today(), 10),
		"health_status": "Open",
	}
	data.update(overrides)
	return frappe.get_doc(data).insert(ignore_permissions=True)


def _make_sprint(project, state="Active"):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": "SP1",
		"parent_vt_item": project,
		"start_date": add_days(today(), -3),
		"end_date": add_days(today(), 7),
		"sprint_state": state,
	}).insert(ignore_permissions=True)


def _make_task(parent, *, blocked=False, done=False, owner=None):
	data = {
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": parent,
		"pdca_phase": "CLOSED" if done else "DO",
	}
	if owner:
		data["owner_user"] = owner
	doc = frappe.get_doc(data)
	if blocked:
		# Blocked is orthogonal — set directly; controller leaves it untouched.
		doc.kanban_status = "Blocked"
	return doc.insert(ignore_permissions=True)


class TestPortalProjectsExtended(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_cleanup()

	def tearDown(self):
		_cleanup()

	# --- pure / contract checks ------------------------------------------

	def test_get_project_tasks_invalid_group_by(self):
		with self.assertRaises(ValueError):
			portal_projects.get_project_tasks(project_id="anything", group_by="evil")

	def test_bulk_phase_shift_rejects_invalid_phase(self):
		with self.assertRaises(frappe.ValidationError):
			portal_projects.bulk_phase_shift(task_ids=[], new_phase="HACK")

	def test_list_projects_returns_list(self):
		result = portal_projects.list_projects(filters=None)
		self.assertIsInstance(result, list)

	def test_list_projects_accepts_json_filters(self):
		result = portal_projects.list_projects(filters='{"has_blockers": true}')
		self.assertIsInstance(result, list)

	def test_get_project_members_handles_missing_schema(self):
		result = portal_projects.get_project_members(project_id="nonexistent")
		self.assertIsInstance(result, list)

	def test_bulk_move_tasks_with_empty_list(self):
		result = portal_projects.bulk_move_tasks(task_ids=[], target_sprint="S1")
		self.assertEqual(result, {"moved": 0})

	def test_relink_task_kr_validates_kr_existence(self):
		with self.assertRaises(frappe.ValidationError):
			portal_projects.relink_task_kr(task_ids=[], kr_id="ghost-kr-doesnt-exist")

	# --- seeded VT Item tree checks --------------------------------------

	def test_list_projects_includes_seeded_node(self):
		project = _make_project()
		result = portal_projects.list_projects(filters=None)
		ids = {r["id"] for r in result}
		self.assertIn(project.name, ids)
		row = next(r for r in result if r["id"] == project.name)
		self.assertEqual(row["name"], _PROJ_TITLE)

	def test_list_projects_blocked_count_from_subtree(self):
		project = _make_project()
		_make_task(project.name, blocked=True)
		_make_task(project.name, blocked=False)
		result = portal_projects.list_projects(filters=None)
		row = next(r for r in result if r["id"] == project.name)
		self.assertEqual(row["blocked_count"], 1)

	def test_list_projects_has_blockers_filter(self):
		project = _make_project()
		_make_task(project.name, blocked=True)
		result = portal_projects.list_projects(filters='{"has_blockers": true}')
		self.assertIn(project.name, {r["id"] for r in result})

	def test_list_projects_current_sprint_from_child(self):
		project = _make_project()
		sprint = _make_sprint(project.name)
		result = portal_projects.list_projects(filters=None)
		row = next(r for r in result if r["id"] == project.name)
		self.assertIsNotNone(row["current_sprint"])
		self.assertEqual(row["current_sprint"]["id"], sprint.name)
		self.assertEqual(row["current_sprint"]["name"], "SP1")

	def test_get_project_detail_maps_renamed_fields(self):
		project = _make_project(owner_user="Administrator", leader_user="Administrator")
		sprint = _make_sprint(project.name)
		_make_task(project.name, blocked=True)
		detail = portal_projects.get_project_detail(project_id=project.name)
		self.assertEqual(detail["id"], project.name)
		self.assertEqual(detail["title"], _PROJ_TITLE)
		# Response shape keeps legacy vocabulary, sourced from renamed fields.
		self.assertEqual(detail["project_owner"], "Administrator")
		self.assertEqual(detail["project_leader"], "Administrator")
		self.assertEqual(detail["project_lead"], "Administrator")
		self.assertEqual(detail["status"], "Open")
		self.assertEqual(detail["blocked_count"], 1)
		self.assertIsNotNone(detail["active_sprint"])
		self.assertEqual(detail["active_sprint"]["id"], sprint.name)
		self.assertIsInstance(detail["team_members"], list)

	def test_get_project_detail_team_members(self):
		project = _make_project()
		project.append("team_members", {"user": "Administrator", "role": "Owner"})
		project.save(ignore_permissions=True)
		detail = portal_projects.get_project_detail(project_id=project.name)
		users = {m["user"] for m in detail["team_members"]}
		self.assertIn("Administrator", users)

	def test_create_project_persists_renamed_fields(self):
		payload = {
			"title": _PROJ_TITLE,
			"brand": _ensure_brand(),
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Open",
			"start_date": str(today()),
			"end_date": str(add_days(today(), 10)),
		}
		result = portal_projects.create_project(payload=payload)
		self.assertIn("id", result)
		self.assertEqual(result["title"], _PROJ_TITLE)
		doc = frappe.get_doc("VT Item", result["id"])
		self.assertEqual(doc.node_type, "Project")
		self.assertEqual(doc.owner_user, "Administrator")
		self.assertEqual(doc.leader_user, "Administrator")
		self.assertEqual(doc.health_status, "Open")

	def test_create_project_missing_required_raises(self):
		with self.assertRaises(frappe.ValidationError):
			portal_projects.create_project(payload={"title": _PROJ_TITLE})

	def test_update_project_maps_payload_keys(self):
		project = _make_project()
		result = portal_projects.update_project(
			project_id=project.name,
			payload={"status": "On Track", "project_owner": "Administrator"},
		)
		self.assertEqual(set(result["updated"]), {"status", "project_owner"})
		doc = frappe.get_doc("VT Item", project.name)
		self.assertEqual(doc.health_status, "On Track")
		self.assertEqual(doc.owner_user, "Administrator")

	def test_update_project_team_members(self):
		project = _make_project()
		result = portal_projects.update_project(
			project_id=project.name,
			payload={"team_members": [{"user": "Administrator", "role": "Member"}]},
		)
		self.assertIn("team_members", result["updated"])
		doc = frappe.get_doc("VT Item", project.name)
		self.assertEqual(len(doc.team_members), 1)
		self.assertEqual(doc.team_members[0].user, "Administrator")

	def test_delete_project_cascades_subtree(self):
		project = _make_project()
		sprint = _make_sprint(project.name)
		task = _make_task(sprint.name)
		result = portal_projects.delete_project(project_id=project.name)
		self.assertEqual(result["deleted"], project.name)
		self.assertFalse(frappe.db.exists("VT Item", project.name))
		self.assertFalse(frappe.db.exists("VT Item", sprint.name))
		self.assertFalse(frappe.db.exists("VT Item", task.name))

	def test_bulk_move_tasks_reparents_to_sprint(self):
		project = _make_project()
		sprint = _make_sprint(project.name)
		task = _make_task(project.name)
		result = portal_projects.bulk_move_tasks(
			task_ids=[task.name], target_sprint=sprint.name
		)
		self.assertEqual(result, {"moved": 1})
		self.assertEqual(
			frappe.db.get_value("VT Item", task.name, "parent_vt_item"), sprint.name
		)

	def test_bulk_reassign_sets_owner_user(self):
		project = _make_project()
		task = _make_task(project.name)
		result = portal_projects.bulk_reassign(
			task_ids=[task.name], new_owner="Administrator"
		)
		self.assertEqual(result, {"reassigned": 1})
		self.assertEqual(
			frappe.db.get_value("VT Item", task.name, "owner_user"), "Administrator"
		)

	def test_bulk_phase_shift_done_maps_to_closed(self):
		project = _make_project()
		task = _make_task(project.name)
		result = portal_projects.bulk_phase_shift(
			task_ids=[task.name], new_phase="DONE"
		)
		self.assertEqual(result, {"shifted": 1})
		# DONE → CLOSED on the unified pdca_phase; controller derives kanban=Done.
		self.assertEqual(
			frappe.db.get_value("VT Item", task.name, "pdca_phase"), "CLOSED"
		)
		self.assertEqual(
			frappe.db.get_value("VT Item", task.name, "kanban_status"), "Done"
		)

	def test_get_project_members_returns_seeded_member(self):
		project = _make_project()
		project.append("team_members", {"user": "Administrator", "role": "Member"})
		project.save(ignore_permissions=True)
		_make_task(project.name, owner="Administrator")
		members = portal_projects.get_project_members(project_id=project.name)
		users = {m["user"] for m in members}
		self.assertIn("Administrator", users)
		row = next(m for m in members if m["user"] == "Administrator")
		self.assertEqual(row["capacity_hours"], 40.0)
		self.assertEqual(row["active_task_count"], 1)
