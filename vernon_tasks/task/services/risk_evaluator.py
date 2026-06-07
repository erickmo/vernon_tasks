import frappe
from frappe.utils import date_diff, getdate, today

from vernon_tasks.task.services import vt_item_tree as tree
from vernon_tasks.task.services.threshold import get_project_threshold
from vernon_tasks.task.services.forecast_service import get_forecast

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item); the
# per-task assignee Link assigned_to→owner_user. kanban_status keeps its name.
_BLOCKED_STATUS = "Blocked"
_DONE_PHASE = "CLOSED"
_DEFAULT_WEEKLY_HOURS = 40


def _severity(ratio):
	if ratio >= 2.0:
		return "high"
	if ratio >= 1.0:
		return "med"
	return "low"


def _blocked_risks(project, threshold_days):
	# Replaces `tabVT Task WHERE project=… AND kanban_status='Blocked' AND
	# pdca_phase!='DONE'`: a project's Tasks are its VT Item subtree (the old
	# project Link is now the tree relation), spanning any Sprint level. The
	# assignee Link assigned_to→owner_user; done phase 'DONE'→'CLOSED'.
	rows = tree.descendants(
		project,
		"Task",
		filters={"kanban_status": _BLOCKED_STATUS, "pdca_phase": ["!=", _DONE_PHASE]},
		fields=["name", "title", "owner_user", "modified"],
	)

	risks = []
	today_d = getdate(today())
	for r in rows:
		days = date_diff(today_d, getdate(r["modified"]))
		if days > threshold_days:
			ratio = days / threshold_days
			risks.append({
				"type": "blocked",
				"severity": _severity(ratio),
				"target": r["name"],
				"detail": f"{r['title']} blocked {days}d (assignee: {r['owner_user'] or 'unassigned'})",
				"days": int(days),
			})
	return risks


def _slip_risk(project, threshold_pct):
	project_doc = frappe.get_doc("VT Item", project)
	if not project_doc.end_date:
		return []
	forecast = get_forecast(project)
	if forecast.get("insufficient_data"):
		return []

	planned = getdate(project_doc.end_date)
	predicted = getdate(forecast["predicted_end"])
	total_days = max(1, date_diff(planned, getdate(project_doc.start_date)))
	slip_days = date_diff(predicted, planned)
	if slip_days <= 0:
		return []

	slip_pct = (slip_days / total_days) * 100
	if slip_pct < threshold_pct:
		return []

	ratio = slip_pct / threshold_pct
	return [{
		"type": "slip",
		"severity": _severity(ratio),
		"target": project,
		"detail": f"Predicted end {predicted} slips {int(slip_days)}d past planned {planned} ({slip_pct:.1f}%)",
		"days": int(slip_days),
	}]


def _capacity_by_assignee(project):
	# Replaces `SUM(GREATEST(estimated_minutes - actual_minutes, 0)) … GROUP BY
	# assigned_to`: walk the project's Task subtree and accumulate remaining
	# effort per assignee in Python (assigned_to→owner_user, done 'DONE'→
	# 'CLOSED'). Skips Tasks without an assignee, mirroring assigned_to IS NOT
	# NULL.
	rows = tree.descendants(
		project,
		"Task",
		filters={"pdca_phase": ["!=", _DONE_PHASE]},
		fields=["owner_user", "estimated_minutes", "actual_minutes"],
	)
	totals: dict[str, float] = {}
	for r in rows:
		user = r["owner_user"]
		if not user:
			continue
		remaining = max((r["estimated_minutes"] or 0) - (r["actual_minutes"] or 0), 0)
		totals[user] = totals.get(user, 0.0) + remaining
	return totals


def _overcap_risks(project, threshold_pct):
	totals = _capacity_by_assignee(project)

	project_doc = frappe.get_doc("VT Item", project)
	if project_doc.end_date:
		days_left = max(1, date_diff(getdate(project_doc.end_date), getdate(today())))
		available = (days_left / 7) * _DEFAULT_WEEKLY_HOURS
	else:
		available = 2 * _DEFAULT_WEEKLY_HOURS

	risks = []
	for assignee, hrs in totals.items():
		hrs = float(hrs)
		if available <= 0:
			continue
		pct = (hrs / available) * 100
		if pct >= threshold_pct:
			ratio = pct / threshold_pct
			risks.append({
				"type": "overcap",
				"severity": _severity(ratio),
				"target": assignee,
				"detail": f"{assignee} has {hrs:.0f}h of {available:.0f}h available ({pct:.0f}%)",
				"days": 0,
			})
	return risks


def evaluate_risks(project):
	blocked_thr = int(get_project_threshold(project, "blocked_days"))
	slip_thr = float(get_project_threshold(project, "slip_pct"))
	cap_thr = float(get_project_threshold(project, "capacity_pct"))

	return [
		*_blocked_risks(project, blocked_thr),
		*_slip_risk(project, slip_thr),
		*_overcap_risks(project, cap_thr),
	]
