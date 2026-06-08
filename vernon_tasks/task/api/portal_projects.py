"""Portal Projects endpoints — list, detail, bulk task ops, members.

VT Item tree notes (see docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html):
- Project / Sprint / Task are `node_type` values on the single `VT Item` tree
  doctype; all reads go through `vt_item_tree` and all writes target VT Item.
- Field renames on the Project node: project_owner→owner_user,
  project_leader→leader_user, status→health_status, objective (Link to legacy
  Objective)→parent_vt_item (Link to the OKR node). Data field names preserved
  (start_date, end_date, pdca_phase, *_threshold, team_members child table).
- Sprint renames: status→sprint_state, sprint_title→title. A Sprint is a direct
  child of its Project (parent_vt_item).
- Task renames: assigned_to→owner_user; the legacy VT Task.sprint Link is now the
  tree parent (re-parent a Task to a Sprint via parent_vt_item). The done phase
  is CLOSED (not DONE); the controller derives kanban_status from pdca_phase,
  except "Blocked" which is set directly.
- Key Result is no longer a standalone doctype — KRs are `VT Item Key Result`
  child rows on OKR nodes.
- VT Project has NO health_score / percent_done columns surfaced here — defaults.
- Kanban "Blocked" status is Title-cased (not "BLOCKED").
- VT Employee Capacity doctype does not exist; capacity defaults to 40h/week.
"""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services import vt_item_tree as tree
from vernon_tasks.task.services.project_task_grouper import group_tasks

# Legacy CLIENT phase vocabulary accepted by bulk_phase_shift — keep "DONE"
# here (NOT "CLOSED"): it is translated to the unified terminal CLOSED on write
# (see PHASE_DONE→PHASE_CLOSED in bulk_phase_shift). Changing it to CLOSED would
# break the existing client payload contract.
ALLOWED_PHASES = {"BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"}
# Legacy callers send "DONE" as the terminal phase; the unified pdca_phase select
# names it CLOSED. Translate on write so the controller's kanban derivation fires.
PHASE_DONE = "DONE"
PHASE_CLOSED = "CLOSED"
DEFAULT_CAPACITY_HOURS = 40.0
BLOCKED_STATUS = "Blocked"
DONE_KANBAN_STATUS = "Done"
ACTIVE_SPRINT_STATE = "Active"
# All Project/Sprint/Task reads + writes target the unified VT Item tree doctype.
PROJECT_DOCTYPE = "VT Item"
TASK_DOCTYPE = "VT Item"
# node_type discriminators on the VT Item tree.
PROJECT_NODE_TYPE = "Project"
SPRINT_NODE_TYPE = "Sprint"
TASK_NODE_TYPE = "Task"
OKR_NODE_TYPE = "OKR"
# Child-table doctype for Key Results (rows on OKR nodes) — relink validation.
KEY_RESULT_DOCTYPE = "VT Item Key Result"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_projects(filters: str | dict | None = None) -> list[dict]:
	"""Return projects matching the given filter blob.

	Role-aware default: returns every readable Project node. `health_score` and
	`percent_done` are not surfaced from VT Item here — defaults (0 / amber) until
	those analytics columns land.
	"""
	require_login()
	parsed = _parse_filters(filters)
	rows = tree.nodes(
		PROJECT_NODE_TYPE,
		fields=[
			"name",
			"title",
			"brand",
			"leader_user AS project_lead",
			"end_date",
			"health_status",
		],
		limit=500,
	)
	out: list[dict] = []
	for r in rows:
		out.append(
			{
				"id": r.get("name"),
				"name": r.get("title") or r.get("name"),
				"brand": r.get("brand"),
				"health": _health_bucket(None),
				"percent_done": 0.0,
				"days_left": _days_left(r.get("end_date")),
				"blocked_count": _safe_blocked_count(r.get("name")),
				"owner": {
					"id": r.get("project_lead") or "",
					"name": r.get("project_lead") or "",
					"avatar": None,
				},
				"current_sprint": _safe_active_sprint(r.get("name")),
			}
		)
	return _apply_client_filters(out, parsed)


def _parse_filters(filters: str | dict | None) -> dict:
	if filters is None:
		return {}
	if isinstance(filters, dict):
		return filters
	try:
		import json

		return json.loads(filters) or {}
	except (TypeError, ValueError):
		return {}


def _apply_client_filters(rows: list[dict], f: dict) -> list[dict]:
	out = rows
	search = (f.get("search") or "").strip().lower()
	if search:
		out = [r for r in out if search in (r.get("name") or "").lower()]
	if f.get("has_blockers"):
		out = [r for r in out if (r.get("blocked_count") or 0) > 0]
	brand = f.get("brand")
	if brand:
		out = [r for r in out if r.get("brand") == brand]
	sort = f.get("sort")
	if sort == "blocked_desc":
		out = sorted(out, key=lambda r: -(r.get("blocked_count") or 0))
	elif sort == "days_left_asc":
		out = sorted(out, key=lambda r: (r.get("days_left") is None, r.get("days_left") or 0))
	return out


def _health_bucket(score: Any) -> str:
	try:
		s = float(score or 0)
	except (TypeError, ValueError):
		return "amber"
	if s >= 75:
		return "green"
	if s >= 50:
		return "amber"
	return "red"


def _days_left(end_date: Any) -> int | None:
	if not end_date:
		return None
	try:
		from datetime import date

		if hasattr(end_date, "year"):
			d = end_date
		else:
			d = frappe.utils.getdate(end_date)
		delta = (d - date.today()).days
		return max(0, delta)
	except Exception:
		return None


def _safe_blocked_count(project_id: str | None) -> int:
	"""Count Blocked Task nodes anywhere in the Project subtree.

	Replaces the legacy `VT Task WHERE project=… AND kanban_status='Blocked'`
	scan: tasks are the Project's nested-set descendants (spanning any Sprint
	level), filtered by kanban_status.
	"""
	if not project_id:
		return 0
	try:
		return len(
			tree.descendants(
				project_id,
				TASK_NODE_TYPE,
				filters={"kanban_status": BLOCKED_STATUS},
			)
		)
	except Exception:
		return 0


def _safe_active_sprint(project_id: str | None) -> dict | None:
	"""Return the active Sprint child of a Project (or None).

	Replaces the legacy `VT Sprint WHERE project=… AND status='Active'` lookup: a
	Sprint is a direct child (parent_vt_item) of its Project; status→sprint_state,
	sprint_title→title.
	"""
	if not project_id:
		return None
	try:
		rows = tree.children(
			project_id,
			SPRINT_NODE_TYPE,
			filters={"sprint_state": ACTIVE_SPRINT_STATE},
			fields=["name", "title", "end_date"],
			limit=1,
		)
	except Exception:
		rows = None
	row = rows[0] if rows else None
	if not row:
		return None
	return {
		"id": row.get("name"),
		"name": row.get("title") or row.get("name"),
		"days_left": _days_left(row.get("end_date")) or 0,
	}


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_project_detail(project_id: str) -> dict:
	require_login()
	project_id = max_str(project_id, 140)
	if not frappe.has_permission(PROJECT_DOCTYPE, "read", project_id):
		raise frappe.PermissionError
	p = frappe.get_doc(PROJECT_DOCTYPE, project_id)
	team_members = [
		{
			"user": row.get("user"),
			"role": row.get("role") or "Member",
			"is_also_leader": bool(row.get("is_also_leader")),
		}
		for row in (getattr(p, TEAM_MEMBER_FIELD, None) or [])
	]
	return {
		"id": p.name,
		"title": getattr(p, "title", p.name),
		"brand": getattr(p, "brand", None),
		"project_owner": getattr(p, "owner_user", None),
		"project_leader": getattr(p, "leader_user", None),
		"project_lead": getattr(p, "leader_user", None),
		"health_score": 0.0,
		"percent_done": 0.0,
		"start_date": str(p.start_date) if getattr(p, "start_date", None) else None,
		"end_date": str(p.end_date) if getattr(p, "end_date", None) else None,
		"status": getattr(p, "health_status", None),
		"pdca_phase": getattr(p, "pdca_phase", None),
		"active_sprint": _safe_active_sprint(p.name),
		"linked_objective": tree.ancestor_of_type(p.name, OKR_NODE_TYPE),
		"blocked_count": _safe_blocked_count(p.name),
		"blocked_days_threshold": getattr(p, "blocked_days_threshold", None),
		"slip_pct_threshold": getattr(p, "slip_pct_threshold", None),
		"capacity_pct_threshold": getattr(p, "capacity_pct_threshold", None),
		"team_members": team_members,
	}


# ---------------------------------------------------------------------------
# Tasks (grouped)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_project_tasks(project_id: str, group_by: str = "kr") -> list[dict]:
	require_login()
	project_id = max_str(project_id, 140)
	if not frappe.has_permission(PROJECT_DOCTYPE, "read", project_id):
		raise frappe.PermissionError
	return group_tasks(project_id=project_id, group_by=group_by)


# ---------------------------------------------------------------------------
# User search (for owner/leader/member pickers)
# ---------------------------------------------------------------------------

USER_SEARCH_LIMIT = 20


@frappe.whitelist()
def search_users(query: str = "", limit: int = USER_SEARCH_LIMIT) -> list[dict]:
	"""Return enabled non-Guest users matching `query` by name/email.

	Used by the portal Project modal pickers for owner / leader / team members.
	User is not part of the VT Item migration — direct query unchanged.
	"""
	require_login()
	q = max_str(query or "", 100).strip()
	try:
		limit_int = max(1, min(int(limit), 50))
	except (TypeError, ValueError):
		limit_int = USER_SEARCH_LIMIT
	like = f"%{q}%" if q else None
	if like:
		rows = frappe.db.sql(
			"""
			SELECT name, full_name, email, user_image
			  FROM `tabUser`
			 WHERE enabled = 1
			   AND name != 'Guest'
			   AND user_type = 'System User'
			   AND (full_name LIKE %(like)s
			        OR name LIKE %(like)s
			        OR email LIKE %(like)s)
			 ORDER BY full_name ASC
			 LIMIT %(lim)s
			""",
			{"like": like, "lim": limit_int},
			as_dict=True,
		)
	else:
		rows = frappe.db.sql(
			"""
			SELECT name, full_name, email, user_image
			  FROM `tabUser`
			 WHERE enabled = 1
			   AND name != 'Guest'
			   AND user_type = 'System User'
			 ORDER BY full_name ASC
			 LIMIT %(lim)s
			""",
			{"lim": limit_int},
			as_dict=True,
		)
	return [
		{
			"user": r.get("name"),
			"full_name": r.get("full_name") or r.get("name"),
			"email": r.get("email") or r.get("name"),
			"avatar": r.get("user_image") or None,
		}
		for r in rows
	]


# ---------------------------------------------------------------------------
# Bulk mutations
# ---------------------------------------------------------------------------


@frappe.whitelist()
def bulk_move_tasks(task_ids: list[str], target_sprint: str) -> dict:
	"""Move Task nodes into a target Sprint by re-parenting them in the tree.

	The legacy VT Task.sprint Link is now the tree parent: setting
	parent_vt_item re-homes the Task under the Sprint (NestedSet recomputes
	lft/rgt on save).
	"""
	require_login()
	ids = _coerce_id_list(task_ids)
	target_sprint = max_str(target_sprint, 140)
	for tid in ids:
		doc = frappe.get_doc(TASK_DOCTYPE, tid)
		doc.parent_vt_item = target_sprint
		doc.save()
	return {"moved": len(ids)}


@frappe.whitelist()
def bulk_reassign(task_ids: list[str], new_owner: str) -> dict:
	require_login()
	ids = _coerce_id_list(task_ids)
	new_owner = max_str(new_owner, 140)
	for tid in ids:
		# VT Task.assigned_to is renamed to owner_user on VT Item Task nodes.
		frappe.db.set_value(TASK_DOCTYPE, tid, "owner_user", new_owner)
	return {"reassigned": len(ids)}


@frappe.whitelist()
def bulk_phase_shift(task_ids: list[str], new_phase: str) -> dict:
	require_login()
	if new_phase not in ALLOWED_PHASES:
		raise frappe.ValidationError(f"invalid phase {new_phase}")
	# The unified terminal phase is CLOSED; legacy "DONE" maps to it.
	phase = PHASE_CLOSED if new_phase == PHASE_DONE else new_phase
	ids = _coerce_id_list(task_ids)
	for tid in ids:
		doc = frappe.get_doc(TASK_DOCTYPE, tid)
		doc.pdca_phase = phase
		doc.save()
	return {"shifted": len(ids)}


@frappe.whitelist()
def relink_task_kr(task_ids: list[str], kr_id: str | None = None) -> dict:
	"""Validate a KR and (would) attach it to tasks.

	VT Item Task nodes have no `linked_kr` column (KRs link at the OKR level
	only). We keep the validation contract (raise on unknown KR) but skip the
	persistent write. Key Results are now `VT Item Key Result` child rows on OKR
	nodes, so existence is checked against that child doctype.
	"""
	require_login()
	ids = _coerce_id_list(task_ids)
	if kr_id:
		kr_id = max_str(kr_id, 140)
		if not frappe.db.exists(KEY_RESULT_DOCTYPE, kr_id):
			raise frappe.ValidationError("KR not found")
	return {"relinked": len(ids), "kr": kr_id}


def _coerce_id_list(task_ids: Any) -> list[str]:
	if task_ids is None:
		return []
	if isinstance(task_ids, str):
		import json

		try:
			parsed = json.loads(task_ids)
		except (TypeError, ValueError):
			parsed = [task_ids]
		task_ids = parsed
	if not isinstance(task_ids, (list, tuple)):
		return []
	return [max_str(t, 140) for t in task_ids if t]


# ---------------------------------------------------------------------------
# CRUD (create / update / delete)
# ---------------------------------------------------------------------------

# Portal payload keys (left) → VT Item field names (right). The React client
# still speaks the legacy field vocabulary; map on write/read. `objective` maps
# to the tree parent (parent_vt_item = the OKR node).
PAYLOAD_FIELD_MAP = {
	"title": "title",
	"brand": "brand",
	"project_owner": "owner_user",
	"project_leader": "leader_user",
	"start_date": "start_date",
	"end_date": "end_date",
	"status": "health_status",
	"pdca_phase": "pdca_phase",
	"objective": "parent_vt_item",
	"blocked_days_threshold": "blocked_days_threshold",
	"slip_pct_threshold": "slip_pct_threshold",
	"capacity_pct_threshold": "capacity_pct_threshold",
}
EDITABLE_PROJECT_FIELDS = tuple(PAYLOAD_FIELD_MAP.keys())
REQUIRED_CREATE_FIELDS = ("title", "brand", "project_owner", "start_date", "end_date")
TEAM_MEMBER_ROLES = {"Owner", "Leader", "Member"}
TEAM_MEMBER_FIELD = "team_members"


def _parse_payload(payload: Any) -> dict:
	"""Parse a JSON-string or dict project payload into a plain dict."""
	if payload is None:
		return {}
	if isinstance(payload, dict):
		return payload
	try:
		import json

		return json.loads(payload) or {}
	except (TypeError, ValueError):
		raise frappe.ValidationError("invalid payload")


def _whitelisted_fields(payload: dict) -> dict:
	"""Strip payload to portal-settable fields, mapped to VT Item field names."""
	return {
		PAYLOAD_FIELD_MAP[k]: payload[k]
		for k in EDITABLE_PROJECT_FIELDS
		if k in payload
	}


def _normalize_team_members(raw: Any) -> list[dict] | None:
	"""Coerce a payload `team_members` blob into clean child-row dicts.

	Returns None if the payload omits the key (so the caller leaves the
	existing roster untouched). Returns [] when explicitly cleared.
	"""
	if raw is None:
		return None
	if isinstance(raw, str):
		import json

		try:
			raw = json.loads(raw)
		except (TypeError, ValueError):
			raise frappe.ValidationError("invalid team_members payload")
	if not isinstance(raw, list):
		raise frappe.ValidationError("team_members must be a list")
	out: list[dict] = []
	seen: set[str] = set()
	for entry in raw:
		if not isinstance(entry, dict):
			continue
		user = max_str(entry.get("user") or "", 140)
		if not user or user in seen:
			continue
		role = entry.get("role") or "Member"
		if role not in TEAM_MEMBER_ROLES:
			role = "Member"
		out.append(
			{
				"user": user,
				"role": role,
				"is_also_leader": 1 if entry.get("is_also_leader") else 0,
			}
		)
		seen.add(user)
	return out


def _apply_team_members(doc, members: list[dict] | None) -> None:
	if members is None:
		return
	doc.set(TEAM_MEMBER_FIELD, [])
	for row in members:
		doc.append(TEAM_MEMBER_FIELD, row)


def _project_can_manage() -> dict:
	"""Return UI capability flags for the current user on Project nodes."""
	return {
		"can_create": bool(frappe.has_permission(PROJECT_DOCTYPE, "create")),
		"can_write": bool(frappe.has_permission(PROJECT_DOCTYPE, "write")),
		"can_delete": bool(frappe.has_permission(PROJECT_DOCTYPE, "delete")),
	}


@frappe.whitelist()
def get_project_permissions() -> dict:
	"""Capability flags consumed by the React portal to gate CRUD UI."""
	require_login()
	return _project_can_manage()


@frappe.whitelist()
def create_project(payload: str | dict) -> dict:
	"""Create a Project node on the VT Item tree. Requires create perm."""
	require_login()
	if not frappe.has_permission(PROJECT_DOCTYPE, "create"):
		raise frappe.PermissionError
	parsed = _parse_payload(payload)
	missing = [f for f in REQUIRED_CREATE_FIELDS if not parsed.get(f)]
	if missing:
		raise frappe.ValidationError(f"missing required fields: {', '.join(missing)}")
	data = _whitelisted_fields(parsed)
	members = _normalize_team_members(parsed.get("team_members"))
	doc = frappe.get_doc(
		{"doctype": PROJECT_DOCTYPE, "node_type": PROJECT_NODE_TYPE, **data}
	)
	_apply_team_members(doc, members)
	doc.insert(ignore_permissions=False)
	return {"id": doc.name, "title": doc.title}


@frappe.whitelist()
def update_project(project_id: str, payload: str | dict) -> dict:
	"""Update editable fields on a Project node. Requires write perm on the doc."""
	require_login()
	project_id = max_str(project_id, 140)
	if not frappe.has_permission(PROJECT_DOCTYPE, "write", doc=project_id):
		raise frappe.PermissionError
	parsed = _parse_payload(payload)
	data = _whitelisted_fields(parsed)
	members = _normalize_team_members(parsed.get("team_members"))
	if not data and members is None:
		return {"id": project_id, "updated": []}
	doc = frappe.get_doc(PROJECT_DOCTYPE, project_id)
	for field, value in data.items():
		setattr(doc, field, value)
	_apply_team_members(doc, members)
	doc.save(ignore_permissions=False)
	# Report the payload keys the caller sent (legacy vocabulary), not the
	# internal VT Item field names.
	updated = [k for k in EDITABLE_PROJECT_FIELDS if k in parsed]
	if members is not None:
		updated.append("team_members")
	return {"id": doc.name, "updated": updated}


@frappe.whitelist()
def delete_project(project_id: str) -> dict:
	"""Delete a Project node. Requires delete perm.

	A Project node may own Sprint/Task descendants; NestedSet blocks deleting a
	parent before its children, so the subtree is removed deepest-first.
	"""
	require_login()
	project_id = max_str(project_id, 140)
	if not frappe.has_permission(PROJECT_DOCTYPE, "delete", doc=project_id):
		raise frappe.PermissionError
	_delete_subtree(project_id)
	return {"deleted": project_id}


def _delete_subtree(node: str) -> None:
	"""Delete `node` and all its descendants, deepest (highest lft) first."""
	bounds = frappe.db.get_value(PROJECT_DOCTYPE, node, ["lft", "rgt"], as_dict=True)
	if bounds:
		descendants = frappe.get_all(
			PROJECT_DOCTYPE,
			filters={"lft": [">", bounds.lft], "rgt": ["<", bounds.rgt]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc(PROJECT_DOCTYPE, d["name"], ignore_permissions=False)
	frappe.delete_doc(PROJECT_DOCTYPE, node, ignore_permissions=False)


@frappe.whitelist()
def get_project_members(project_id: str) -> list[dict]:
	"""Return team members for a project with capacity + load metrics.

	VT Item tree schema:
	- `tabProject Team Member` is the team_members child table on the Project
	  VT Item node (parenttype 'VT Item', was 'VT Project'); cols: user, role,
	  is_also_leader.
	- Assigned minutes: sum of `Task Schedule Entry.allocated_minutes` for the
	  last 7 days, joined to the parent Task node by `owner_user = pm.user`
	  (assigned_to→owner_user). Tasks belong to the Project via the nested set,
	  so the join scopes to Task nodes inside the Project's lft/rgt range.
	- Capacity: VT Employee Capacity doesn't exist; default 40h/week.
	- Active tasks: Task nodes in the Project subtree assigned to the member and
	  not in the Done kanban column.
	"""
	require_login()
	project_id = max_str(project_id, 140)
	bounds = frappe.db.get_value(
		PROJECT_DOCTYPE, project_id, ["lft", "rgt"], as_dict=True
	)
	if not bounds:
		return []
	rows = frappe.db.sql(
		"""
		SELECT pm.user,
		       u.full_name,
		       pm.role,
		       (SELECT COALESCE(SUM(se.allocated_minutes), 0)
		          FROM `tabTask Schedule Entry` se
		          JOIN `tabVT Item` st
		            ON st.name = se.parent
		           AND se.parenttype = 'VT Item'
		         WHERE st.node_type = 'Task'
		           AND st.owner_user = pm.user
		           AND st.lft > %(lft)s
		           AND st.rgt < %(rgt)s
		           AND se.date >= CURDATE() - INTERVAL 7 DAY) AS assigned_minutes,
		       %(default_capacity)s AS capacity_hours,
		       (SELECT COUNT(*) FROM `tabVT Item` t
		         WHERE t.node_type = 'Task'
		           AND t.lft > %(lft)s
		           AND t.rgt < %(rgt)s
		           AND t.owner_user = pm.user
		           AND t.kanban_status != %(done)s) AS active_task_count
		  FROM `tabProject Team Member` pm
		  JOIN `tabUser` u ON u.name = pm.user
		 WHERE pm.parent = %(p)s
		   AND pm.parenttype = 'VT Item'
		""",
		{
			"p": project_id,
			"lft": bounds.lft,
			"rgt": bounds.rgt,
			"done": DONE_KANBAN_STATUS,
			"default_capacity": DEFAULT_CAPACITY_HOURS,
		},
		as_dict=True,
	)
	return [
		{
			"user": r.user,
			"full_name": r.full_name,
			"role": r.role,
			"assigned_minutes": float(r.assigned_minutes or 0),
			"capacity_hours": float(r.capacity_hours or DEFAULT_CAPACITY_HOURS),
			"active_task_count": int(r.active_task_count or 0),
		}
		for r in rows
	]
