import frappe
from frappe.utils import now_datetime

from vernon_tasks.task.services import vt_item_tree as tree

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item). The legacy
# VT Task.assigned_to assignee Link is kept on the Task node as owner_user, and
# the legacy VT Task.project Link is now the parent_vt_item tree relation. The
# legacy VT Project.project_leader is the Project node's leader_user.
_DONE_PHASE = "CLOSED"


def _get_settings():
	return frappe.get_single("VT Settings")


def _sendmail(recipients, subject, message):
	"""Send email, silently skip if no outgoing email account is configured."""
	try:
		frappe.sendmail(recipients=recipients, subject=subject, message=message, now=False)
	except Exception:
		pass


def _log(task_name, user, tx_type, amount, original_amount=None, overridden_by=None, note=""):
	frappe.get_doc({
		"doctype": "Task Point Log",
		"task": task_name,
		"user": user,
		"transaction_type": tx_type,
		"amount": amount,
		"original_amount": original_amount,
		"overridden_by": overridden_by,
		"log_timestamp": now_datetime(),
		"note": note,
	}).insert(ignore_permissions=True)


def compute_points(weight: float, deadline: str, completion_date: str, revision_count: int) -> dict:
	from frappe.utils import getdate
	settings = _get_settings()
	multiplier = settings.weight_multiplier or 10
	early_rate = settings.early_bonus_rate or 0.05
	late_rate = settings.late_penalty_rate or 0.08
	revision_rate = settings.revision_deduct_rate or 0.10

	# Points are whole numbers — round each component to the nearest int so
	# base/earned/bonus/penalty stay integer end-to-end (Int doctype fields).
	base = int(round(weight * multiplier))
	days_diff = (getdate(deadline) - getdate(completion_date)).days

	early_bonus = int(round(base * early_rate * days_diff)) if days_diff > 0 else 0
	late_penalty = int(round(base * late_rate * abs(days_diff))) if days_diff < 0 else 0
	revision_deduction = int(round(revision_rate * base * revision_count))
	earned = base + early_bonus - late_penalty - revision_deduction

	return {"base": base, "early_bonus": early_bonus, "late_penalty": late_penalty,
			"revision_deduction": revision_deduction, "earned": earned}


def calculate_points(doc, method) -> None:
	if doc.pdca_phase != _DONE_PHASE or not doc.completion_date:
		return

	result = compute_points(
		weight=doc.weight or 1.0,
		deadline=doc.deadline,
		completion_date=doc.completion_date,
		revision_count=doc.revision_count or 0,
	)

	doc.base_points = result["base"]
	doc.earned_points = result["earned"]
	doc.db_set("base_points", result["base"])
	doc.db_set("earned_points", result["earned"])

	_log(doc.name, doc.owner_user, "earned", result["base"])
	if result["early_bonus"] > 0:
		_log(doc.name, doc.owner_user, "early_bonus", result["early_bonus"])
	if result["late_penalty"] > 0:
		_log(doc.name, doc.owner_user, "late_penalty", -result["late_penalty"])
	if result["revision_deduction"] > 0:
		_log(doc.name, doc.owner_user, "revision_deduction", -result["revision_deduction"])

	from frappe.utils import getdate
	period = getdate(doc.completion_date).strftime("%Y-%m")
	from vernon_tasks.workforce.doctype.user_point_summary.user_point_summary import add_points_to_period
	add_points_to_period(
		user=doc.owner_user, period=period,
		earned=result["base"], bonus=result["early_bonus"],
		penalty=result["late_penalty"], override_delta=0.0,
	)

	from vernon_tasks.workforce.doctype.daily_summary.daily_summary import get_or_create_today
	from vernon_tasks.workforce.doctype.work_profile.work_profile import get_daily_target_hours
	summary = get_or_create_today(doc.owner_user, get_daily_target_hours(doc.owner_user))
	frappe.db.set_value(
		"Daily Summary", summary.name, "total_points_today",
		(summary.total_points_today or 0) + result["earned"]
	)


def apply_revision_deduction(task_name: str) -> None:
	task = frappe.get_doc("VT Item", task_name)
	settings = _get_settings()
	deduction = int(round((settings.revision_deduct_rate or 0.10) * (task.base_points or 0)))
	new_count = (task.revision_count or 0) + 1

	# Use db_set to bypass PDCA transition validation (revision is an admin action)
	frappe.db.set_value("VT Item", task_name, {
		"revision_count": new_count,
		"pdca_phase": "ACT",
		"kanban_status": "Revision",
	})

	_log(task_name, task.owner_user, "revision_deduction", -deduction,
		 note=f"Revision #{new_count}")

	_sendmail(
		recipients=[task.owner_user],
		subject=f"Revision requested: {task.title}",
		message=f"Leader has requested revision on task <b>{task.title}</b>. Deduction: {deduction} pts.",
	)


def override_points(task_name: str, new_points: float, reason: str, overridden_by: str) -> None:
	task = frappe.get_doc("VT Item", task_name)
	original = task.earned_points or 0
	new_points = int(round(float(new_points)))
	delta = new_points - original

	task.leader_override_points = new_points
	task.override_reason = reason
	task.save(ignore_permissions=True)

	_log(task_name, task.owner_user, "leader_override", delta,
		 original_amount=original, overridden_by=overridden_by, note=reason)

	from frappe.utils import getdate, today
	period = getdate(task.completion_date or today()).strftime("%Y-%m")
	from vernon_tasks.workforce.doctype.user_point_summary.user_point_summary import add_points_to_period
	add_points_to_period(
		user=task.owner_user, period=period,
		earned=0, bonus=0, penalty=0, override_delta=delta,
	)

	_sendmail(
		recipients=[task.owner_user],
		subject=f"Points adjusted: {task.title}",
		message=f"Points adjusted: {original} → {new_points} (Δ {delta:+.2f}). Reason: {reason}",
	)


def check_overdue_tasks() -> None:
	from frappe.utils import today
	overdue = tree.nodes(
		"Task",
		filters={"deadline": ["<", today()], "pdca_phase": ["not in", [_DONE_PHASE]], "owner_user": ["!=", ""]},
		fields=["name", "title", "owner_user"],
	)
	for task in overdue:
		project = tree.project_of(task.name)
		proj_leader = frappe.db.get_value("VT Item", project, "leader_user") if project else None
		recipients = [task.owner_user]
		if proj_leader and proj_leader not in recipients:
			recipients.append(proj_leader)
		_sendmail(
			recipients=recipients,
			subject=f"OVERDUE: {task.title}",
			message=f"Task <b>{task.title}</b> is overdue.",
		)
