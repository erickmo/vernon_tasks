from typing import List, Dict, Optional

import frappe

ACTIVE_STATUSES = ("Open", "On Track", "At Risk")


@frappe.whitelist()
def get_brand_strategy_tree(brand: Optional[str] = None) -> List[Dict]:
	"""Return Brand → Objective → (Key Results, KPI Definitions, Linked Projects) tree.

	If `brand` given, returns single-brand list. Otherwise iterates all brands.
	"""
	brand_filters: Dict = {}
	if brand:
		brand_filters["name"] = brand

	brands = frappe.get_all(
		"VT Brand",
		filters=brand_filters,
		fields=["name", "brand_name", "logo", "description"],
		order_by="brand_name ASC",
	)

	result: List[Dict] = []
	for b in brands:
		objectives = _fetch_objectives(b["name"])
		unlinked = _fetch_unattached_projects(b["name"])
		result.append({
			"brand": b["name"],
			"brand_name": b["brand_name"],
			"logo": b.get("logo"),
			"description": b.get("description"),
			"objective_count": len(objectives),
			"project_count": _count_projects(b["name"]),
			"objectives": objectives,
			"unlinked_projects": unlinked,
		})
	return result


def _fetch_objectives(brand_name: str) -> List[Dict]:
	objectives = frappe.get_all(
		"Objective",
		filters={"brand": brand_name},
		fields=[
			"name", "title", "period", "period_start", "period_end",
			"objective_owner", "status", "pdca_phase", "description",
		],
		# Nearest deadline first; objectives without period_end sink to bottom.
		order_by="CASE WHEN period_end IS NULL THEN 1 ELSE 0 END ASC, period_end ASC, modified DESC",
	)
	for o in objectives:
		o["key_results"] = frappe.get_all(
			"Key Result",
			filters={"objective": o["name"]},
			fields=[
				"name", "metric", "target_value", "current_value",
				"unit", "progress_percent", "confidence",
			],
			order_by="modified ASC",
		)
		o["kpi_definitions"] = frappe.get_all(
			"KPI Definition",
			filters={"objective": o["name"]},
			fields=["name", "kpi_name", "frequency", "unit"],
			order_by="kpi_name ASC",
		)
		o["projects"] = frappe.get_all(
			"VT Project",
			filters={"objective": o["name"]},
			fields=[
				"name", "title", "status", "pdca_phase",
				"start_date", "end_date", "health_score", "percent_done",
			],
			# Nearest deadline first; projects without end_date sink to bottom.
			order_by="CASE WHEN end_date IS NULL THEN 1 ELSE 0 END ASC, end_date ASC, modified DESC",
		)
	return objectives


def _fetch_unattached_projects(brand_name: str) -> List[Dict]:
	rows = frappe.db.sql(
		"""
		SELECT name, title, status, pdca_phase,
		       start_date, end_date, health_score, percent_done
		FROM `tabVT Project`
		WHERE brand = %(brand)s
		  AND (objective IS NULL OR objective = '')
		ORDER BY (end_date IS NULL) ASC, end_date ASC, modified DESC
		""",
		{"brand": brand_name},
		as_dict=True,
	)
	return rows


def _count_projects(brand_name: str) -> int:
	return frappe.db.count("VT Project", {"brand": brand_name})
