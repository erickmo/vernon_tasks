"""Compose role-aware dashboard payload from existing services.

Migrated to the unified VT Item tree (P2). Legacy doctypes (VT Project,
VT Sprint, VT Task, Objective, Key Result) are now typed VT Item nodes; the
flat Link relations (VT Task.project / .sprint, VT Project.objective) become
tree relations (nested-set descendants, parent chain, child tables). Field
renames: project_owner→owner_user, project_leader→leader_user,
Project/Objective status→health_status, Sprint status→sprint_state,
assigned_to→owner_user, done phase 'DONE'→'CLOSED'. Key Results are child
rows on the OKR node ("key_results"). Task Point Log is unchanged (separate
doctype). The public return shape of build_home_payload is preserved.
"""
from __future__ import annotations

from typing import Literal

import frappe

# NOTE: The plan references `compute_health_score` and `evaluate_user_risk_items`
# but the existing services expose `get_health_score()` (no scope arg) and
# `evaluate_risks(project)` (per-project). We adapt locally rather than mutate
# upstream services. See "concerns" in commit/PR description.
from vernon_tasks.task.services.health_score_service import get_health_score
from vernon_tasks.task.services import vt_item_tree as tree

Role = Literal["ic", "leader", "pm", "exec"]

HEALTH_DROP_THRESHOLD = 10
ONTIME_FLOOR = 0.70
CHECKIN_STALE_DAYS = 5

_TEAM_ROLES = ("leader", "pm")
_DEFAULT_WEEKLY_HOURS = 40
_STREAK_MAX_LOOKBACK_DAYS = 365
# Project/Objective status → health_status; closed value is "Closed".
_PROJECT_CLOSED_STATUS = "Closed"
# Legacy VT Task done phase ("DONE") is the unified completion phase "CLOSED".
_TASK_DONE_PHASE = "CLOSED"
_TASK_BLOCKED_STATUS = "Blocked"
# VT Sprint.status → sprint_state; active value is "Active".
_SPRINT_ACTIVE_STATUS = "Active"

_PROJECT = "Project"
_SPRINT = "Sprint"
_TASK = "Task"
_OKR = "OKR"
_TEAM_TABLE = "tabProject Team Member"


def build_home_payload(user: str, role: Role) -> dict:
	return {
		"role": role,
		"at_risk": _at_risk(user, role),
		"today": _today(user, role),
		"me": _me(user),
		"sprints": _active_sprints(user),
		"projects": _my_projects(user),
	}


# ── at-risk ────────────────────────────────────────────────────────────────

def _at_risk(user: str, role: str) -> list[dict]:
	"""Return list of at-risk project items for the user.

	Plan calls `evaluate_user_risk_items(user, scope, thresholds)` which does
	not exist. We aggregate per-project risks from existing `evaluate_risks`
	over the user's projects; when no projects → empty list (matches test).
	"""
	try:
		from vernon_tasks.task.services.risk_evaluator import evaluate_risks
	except Exception:
		return []

	project_ids = _user_project_ids(user, scope="team" if role in _TEAM_ROLES else "self")
	items: list[dict] = []
	for project_id in project_ids:
		try:
			risks = evaluate_risks(project_id)
		except Exception:
			continue
		project_name = frappe.db.get_value("VT Item", project_id, "title") or project_id
		for risk in risks:
			if risk.get("severity") not in ("high", "med"):
				continue
			items.append({
				"project_id": project_id,
				"project_name": project_name,
				"reason": risk.get("detail") or risk.get("type") or "",
				"severity": risk.get("severity"),
			})
	return items


def _member_project_ids(user: str) -> set[str]:
	"""Project node names where `user` is in the team_members child table.

	Replaces the LEFT JOIN on `tabProject Team Member`: team_members is now a
	child table on the Project VT Item node (parenttype 'VT Item').
	"""
	try:
		rows = frappe.db.sql(
			"""
			SELECT DISTINCT parent FROM `{table}`
			 WHERE parenttype = 'VT Item' AND user = %(u)s
			""".format(table=_TEAM_TABLE),
			{"u": user},
			as_dict=True,
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return set()
	return {r["parent"] for r in rows}


def _user_project_ids(user: str, scope: str) -> list[str]:
	"""Return project IDs the user is involved in.

	Project nodes carry `owner_user` + `leader_user` (Link → User) and a
	`team_members` child table. Scope='self' returns projects the user owns or
	leads; scope='team' additionally includes projects where they appear as a
	team member. Excludes Closed projects (health_status).
	"""
	rows = tree.nodes(
		_PROJECT,
		filters={"health_status": ["!=", _PROJECT_CLOSED_STATUS]},
		fields=["name", "owner_user", "leader_user"],
	)
	member_ids = _member_project_ids(user) if scope == "team" else set()
	out: list[str] = []
	for r in rows:
		if r["owner_user"] == user or r["leader_user"] == user or r["name"] in member_ids:
			out.append(r["name"])
	return out


# ── today ──────────────────────────────────────────────────────────────────

def _today(user: str, role: str) -> dict:
	base = {
		"ontime_rate_7d": _ontime_rate(user, days=7),
		"blocked_count": _blocked_count(user),
		"okr_confidence_delta_wow": _okr_delta_wow(user),
		"next_deadline": _next_deadline(user),
		"pdca_queue": _pdca_queue_counts(user),
	}
	if role == "exec":
		base["org_health_score"] = _safe_org_health_score()
	return base


def _safe_org_health_score() -> float:
	try:
		return float(get_health_score().get("score") or 0.0)
	except Exception:
		return 0.0


# ── me ─────────────────────────────────────────────────────────────────────

def _me(user: str) -> dict:
	return {
		"points_week": _points_week(user),
		"streak_days": _streak_days(user),
		"capacity_used_pct": _capacity_used_pct(user),
		"ontime_rate_7d": _ontime_rate(user, days=7),
	}


# ── sprints ────────────────────────────────────────────────────────────────

def _active_sprints(user: str) -> list[dict]:
	"""Active sprints user is involved in via assigned Task nodes.

	Replaces the `VT Sprint JOIN VT Task ON t.sprint=s.name` scan: Tasks are
	VT Item children of the Sprint node. We list Active Sprint nodes, then keep
	those that have at least one Task assigned to the user (assigned_to→
	owner_user). percent_done is derived; burndown surfaced empty here.
	"""
	sprints = tree.nodes(
		_SPRINT,
		filters={"sprint_state": _SPRINT_ACTIVE_STATUS},
		fields=["name", "title", "start_date", "end_date"],
		order_by="end_date asc",
	)

	today = frappe.utils.getdate()
	out = []
	for s in sprints:
		mine = tree.children(s["name"], _TASK, filters={"owner_user": user}, fields=["name"])
		if not mine:
			continue
		days_left = max(0, (s["end_date"] - today).days) if s["end_date"] else 0
		out.append({
			"id": s["name"],
			"name": s["title"],
			"days_left": days_left,
			"percent_done": _sprint_percent_done(s["name"]),
			"burndown_spark": [],
		})
	return out


def _sprint_percent_done(sprint_id: str) -> float:
	"""Compute percent_done from CLOSED Task nodes / total in the sprint.

	Tasks are VT Item children of the Sprint node (the old VT Task.sprint Link
	is now the parent relation).
	"""
	tasks = tree.children(sprint_id, _TASK, fields=["pdca_phase"])
	total = len(tasks)
	if not total:
		return 0.0
	done_n = sum(1 for t in tasks if t["pdca_phase"] == _TASK_DONE_PHASE)
	return round(done_n / total * 100, 1)


# ── projects ───────────────────────────────────────────────────────────────

def _my_projects(user: str) -> list[dict]:
	"""Projects where user is owner, leader, or team member.

	Reads persisted `health_score` directly; falls back to grey bucket only
	when score is NULL. Excludes Closed projects (health_status).
	"""
	rows = tree.nodes(
		_PROJECT,
		filters={"health_status": ["!=", _PROJECT_CLOSED_STATUS]},
		fields=["name", "title", "owner_user", "leader_user", "end_date", "health_score"],
	)
	member_ids = _member_project_ids(user)

	today = frappe.utils.getdate()
	out = []
	for r in rows:
		if not (r["owner_user"] == user or r["leader_user"] == user or r["name"] in member_ids):
			continue
		score = r["health_score"] if r["health_score"] is not None else None
		out.append({
			"id": r["name"],
			"name": r["title"],
			"health": _health_bucket(score),
			"okr_progress": _project_okr_progress(r["name"]),
			"my_role": _user_role_in_project(user, r["name"], r["owner_user"], r["leader_user"]),
			"blocked_count": _project_blocked_count(r["name"]),
			"days_left": max(0, (r["end_date"] - today).days) if r["end_date"] else None,
		})
	return out


def _project_blocked_count(project_id: str) -> int:
	"""Blocked Task count in a project's subtree (spans any Sprint level)."""
	try:
		rows = tree.descendants(
			project_id, _TASK,
			filters={"kanban_status": _TASK_BLOCKED_STATUS},
			fields=["name"],
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return 0
	return len(rows)


# ── primitives ─────────────────────────────────────────────────────────────

def _health_bucket(score: float | None) -> str:
	if score is None:
		return "grey"
	if score >= 75:
		return "green"
	if score >= 50:
		return "amber"
	return "red"


def _ontime_rate(user: str, days: int) -> float:
	"""On-time rate over last N days for user's done tasks.

	Task nodes (node_type='Task'); assigned_to→owner_user, done 'DONE'→
	'CLOSED'. completion_date/deadline keep their names. Computed in Python
	over the windowed CLOSED tasks.
	"""
	cutoff = frappe.utils.add_days(frappe.utils.today(), -days)
	try:
		rows = tree.nodes(
			_TASK,
			filters={
				"owner_user": user,
				"pdca_phase": _TASK_DONE_PHASE,
				"completion_date": [">=", cutoff],
			},
			fields=["completion_date", "deadline"],
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return 0.0
	total = len(rows)
	if not total:
		return 0.0
	ontime = sum(
		1 for r in rows
		if r["completion_date"] and r["deadline"] and r["completion_date"] <= r["deadline"]
	)
	return round(ontime / total, 3)


def _blocked_count(user: str) -> int:
	try:
		rows = tree.nodes(
			_TASK,
			filters={"owner_user": user, "kanban_status": _TASK_BLOCKED_STATUS},
			fields=["name"],
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return 0
	return len(rows)


def _user_okrs(user: str) -> list[str]:
	"""OKR node names reachable via the user's owned/led (open) projects.

	Project is a child of OKR in the tree; we walk each owned/led project to
	its nearest OKR ancestor.
	"""
	rows = tree.nodes(
		_PROJECT,
		filters={"health_status": ["!=", _PROJECT_CLOSED_STATUS]},
		fields=["name", "owner_user", "leader_user"],
	)
	okrs: list[str] = []
	for r in rows:
		if r["owner_user"] != user and r["leader_user"] != user:
			continue
		okr = tree.ancestor_of_type(r["name"], _OKR)
		if okr and okr not in okrs:
			okrs.append(okr)
	return okrs


def _okr_delta_wow(user: str) -> float:
	"""KR week-over-week confidence delta.

	Average of (confidence - confidence_last_week) across Key Result child
	rows of OKRs reachable via the user's owned/led projects.
	"""
	deltas: list[float] = []
	for okr in _user_okrs(user):
		for kr in tree.child_table_rows(okr, "key_results"):
			deltas.append(float((kr.get("confidence") or 0) - (kr.get("confidence_last_week") or 0)))
	if not deltas:
		return 0.0
	return round(sum(deltas) / len(deltas), 3)


def _next_deadline(user: str) -> dict | None:
	try:
		rows = tree.nodes(
			_TASK,
			filters={
				"owner_user": user,
				"pdca_phase": ["!=", _TASK_DONE_PHASE],
				"deadline": ["is", "set"],
			},
			fields=["name", "title", "deadline"],
			order_by="deadline asc",
			limit=1,
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return None
	if not rows:
		return None
	r = rows[0]
	return {"id": r["name"], "title": r["title"], "due_date": str(r["deadline"])}


def _pdca_queue_counts(user: str) -> dict[str, int]:
	try:
		rows = tree.nodes(
			_TASK,
			filters={"owner_user": user, "pdca_phase": ["!=", _TASK_DONE_PHASE]},
			fields=["pdca_phase"],
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return {}
	counts: dict[str, int] = {}
	for r in rows:
		phase = r["pdca_phase"]
		counts[phase] = counts.get(phase, 0) + 1
	return counts


def _points_week(user: str) -> int:
	"""Sum of earned points for user from Task Point Log over last 7 days.

	Task Point Log is a separate doctype (not part of the VT Item merge); uses
	real columns `user`, `amount`, `log_timestamp`.
	"""
	try:
		row = frappe.db.sql(
			"""
			SELECT SUM(amount) AS p FROM `tabTask Point Log`
			 WHERE user = %(u)s
			   AND log_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
			""",
			{"u": user},
			as_dict=True,
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return 0
	return int((row[0].p if row and row[0].p else 0))


def _streak_days(user: str) -> int:
	from datetime import timedelta
	today = frappe.utils.getdate()
	streak = 0
	for offset in range(0, _STREAK_MAX_LOOKBACK_DAYS):
		d = today - timedelta(days=offset)
		try:
			rows = tree.nodes(
				_TASK,
				filters={
					"owner_user": user,
					"pdca_phase": _TASK_DONE_PHASE,
					"completion_date": d,
				},
				fields=["name"],
			)
		except (frappe.db.OperationalError, frappe.db.ProgrammingError):
			return streak
		if rows:
			streak += 1
		else:
			break
	return streak


def _capacity_used_pct(user: str) -> float:
	"""Capacity used as ratio of remaining estimated hours / weekly capacity.

	No `VT Employee Capacity` doctype exists; we use a default weekly hours
	constant and fall back to remaining (estimated - actual) minutes on the
	user's in-flight Task nodes (pdca_phase != CLOSED).
	"""
	cap = float(_DEFAULT_WEEKLY_HOURS)
	try:
		rows = tree.nodes(
			_TASK,
			filters={"owner_user": user, "pdca_phase": ["!=", _TASK_DONE_PHASE]},
			fields=["estimated_minutes", "actual_minutes"],
		)
	except (frappe.db.OperationalError, frappe.db.ProgrammingError):
		return 0.0
	used = float(sum(max((r["estimated_minutes"] or 0) - (r["actual_minutes"] or 0), 0) for r in rows))
	return round((used / cap) if cap else 0.0, 3)


def _project_okr_progress(project_id: str) -> float:
	"""Average progress of KRs under the project's OKR ancestor.

	Relationship: Project is a child of OKR in the tree; Key Results are child
	rows on the OKR node ("key_results").
	"""
	okr = tree.ancestor_of_type(project_id, _OKR)
	if not okr:
		return 0.0
	krs = tree.child_table_rows(okr, "key_results")
	ratios = [
		(kr.get("current_value") or 0) / kr["target_value"]
		for kr in krs if kr.get("target_value")
	]
	if not ratios:
		return 0.0
	return round(sum(ratios) / len(ratios), 3)


def _user_role_in_project(
	user: str,
	project_id: str,
	project_owner: str | None = None,
	project_leader: str | None = None,
) -> str:
	"""Resolve user's role within a project.

	Priority: owner > leader > team_members.role > 'member'. team_members is a
	child table on the Project VT Item node.
	"""
	if project_owner and project_owner == user:
		return "owner"
	if project_leader and project_leader == user:
		return "leader"
	for member in tree.child_table_rows(project_id, "team_members"):
		if member.get("user") == user:
			return member.get("role") or "member"
	return "member"
