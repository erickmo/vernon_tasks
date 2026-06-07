import frappe
from frappe.utils import add_days, today

from vernon_tasks.task.services import vt_item_tree as tree
from vernon_tasks.task.services.velocity_service import get_velocity_trend

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item).
_DONE_PHASE = "CLOSED"
_CLOSED_STATUS = "Closed"
_ONTIME_WINDOW_DAYS = 90
_OKR_WEIGHT = 0.5
_ONTIME_WEIGHT = 0.3
_VELOCITY_WEIGHT = 0.2


def _okr_pct(brand: str | None = None) -> float:
	"""Mean Key Result progress across non-closed OKRs (optionally brand-scoped).

	Replaces the legacy Objective⨝Key Result join: OKRs are VT Item nodes
	(node_type='OKR', status→health_status); Key Results are child rows
	(`key_results`). Per OKR we average its KR `progress_percent`, then average
	across OKRs that actually have KRs — mirroring the legacy LEFT JOIN +
	AVG(kr.progress_percent) where empty objectives drop out. The legacy
	brand scope (Objective.brand) is the inherited `brand` field on the node.
	"""
	filters = {"health_status": ["!=", _CLOSED_STATUS]}
	if brand:
		filters["brand"] = brand
	okrs = tree.nodes("OKR", filters=filters, fields=["name"])

	okr_avgs = []
	for okr in okrs:
		krs = tree.child_table_rows(okr.name, "key_results")
		progresses = [float(r.get("progress_percent") or 0) for r in krs]
		if progresses:
			okr_avgs.append(sum(progresses) / len(progresses))

	if not okr_avgs:
		return 0.0
	return float(sum(okr_avgs) / len(okr_avgs))


def _ontime_pct(brand: str | None = None) -> float:
	"""On-time completion rate of recently CLOSED Task nodes (optionally
	brand-scoped).

	Replaces the legacy `VT Task WHERE pdca_phase='DONE'` scan: Tasks are
	VT Item nodes (node_type='Task'; done phase 'DONE'→'CLOSED'). The legacy
	`project IN (projects WHERE brand=?)` scope is the inherited `brand` field
	on each Task node. A task is on-time when it has no deadline or completed on
	or before it. completion_date/deadline keep their names.
	"""
	filters = {
		"pdca_phase": _DONE_PHASE,
		"completion_date": [">=", add_days(today(), -_ONTIME_WINDOW_DAYS)],
	}
	if brand:
		filters["brand"] = brand
	tasks = tree.nodes(
		"Task", filters=filters, fields=["completion_date", "deadline"]
	)

	total = len(tasks)
	if total == 0:
		return 0.0
	ontime = sum(
		1 for t in tasks
		if not t.deadline or t.completion_date <= t.deadline
	)
	return round((ontime / total) * 100, 2)


def _velocity_health(brand: str | None = None) -> float:
	"""Health-normalised mean velocity trend across non-closed Projects.

	Replaces the legacy `VT Project WHERE status!='Closed'` scan: Projects are
	VT Item nodes (node_type='Project', status→health_status). Per project the
	velocity trend comes from get_velocity_trend (already tree-aware); only
	projects with ≥2 datapoints contribute. The mean trend is clamped to
	[-50, 50] and centred on 50 to yield a 0–100 health figure.
	"""
	filters = {"health_status": ["!=", _CLOSED_STATUS]}
	if brand:
		filters["brand"] = brand
	projects = tree.nodes("Project", filters=filters, fields=["name"])

	trends = []
	for p in projects:
		result = get_velocity_trend(p["name"], n=6)
		if len(result["velocity"]) >= 2:
			trends.append(result["trend_pct"])

	if not trends:
		return 50.0

	mean_trend = sum(trends) / len(trends)
	clamped = max(-50.0, min(50.0, mean_trend))
	return round(50.0 + clamped, 2)


def get_health_score(brand: str | None = None) -> dict:
	okr = _okr_pct(brand)
	ontime = _ontime_pct(brand)
	velocity = _velocity_health(brand)
	score = round(
		okr * _OKR_WEIGHT + ontime * _ONTIME_WEIGHT + velocity * _VELOCITY_WEIGHT,
		2,
	)
	return {
		"score": score,
		"brand": brand,
		"okr_pct": round(okr, 2),
		"ontime_pct": round(ontime, 2),
		"velocity_health": round(velocity, 2),
		"breakdown": {
			"okr_weight": _OKR_WEIGHT,
			"ontime_weight": _ONTIME_WEIGHT,
			"velocity_weight": _VELOCITY_WEIGHT,
		},
	}


def list_brand_health_scores() -> list[dict]:
	brands = frappe.get_all("VT Brand", fields=["name", "brand_name"], order_by="brand_name ASC")
	result = []
	for b in brands:
		snap = get_health_score(brand=b["name"])
		snap["brand_name"] = b["brand_name"]
		result.append(snap)
	return result
