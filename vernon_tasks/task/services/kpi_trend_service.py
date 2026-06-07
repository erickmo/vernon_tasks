import frappe
from vernon_tasks.task.services import vt_item_tree as tree

_KPI = "KPI"
_ENTRY_TABLE = "tabVT Item KPI Entry"


def list_kpis() -> list[dict]:
	# KPI nodes live in the unified VT Item tree (node_type="KPI"); the
	# legacy KPI Definition.kpi_name is now VT Item.title.
	rows = tree.nodes(
		_KPI,
		fields=["name", "title", "unit", "frequency"],
		order_by="title asc",
	)
	return [{
		"name": r["name"],
		"kpi_name": r["title"],
		"unit": r["unit"],
		"frequency": r["frequency"],
	} for r in rows]


def get_kpi_trend(kpi_definition: str, periods: int = 12) -> dict:
	if not frappe.db.exists("VT Item", {"name": kpi_definition, "node_type": _KPI}):
		raise frappe.DoesNotExistError(f"KPI not found: {kpi_definition}")

	meta = frappe.db.get_value(
		"VT Item", kpi_definition,
		["title", "unit"], as_dict=True,
	)

	# KPI Entries are child rows on the KPI node (table "kpi_entries",
	# doctype "VT Item KPI Entry"); join via parent to honour periods limit.
	rows = frappe.db.sql("""
		SELECT date, value
		FROM `{table}`
		WHERE parent = %(kpi)s AND parenttype = 'VT Item'
		ORDER BY date DESC
		LIMIT %(n)s
	""".format(table=_ENTRY_TABLE),
		{"kpi": kpi_definition, "n": periods}, as_dict=True)

	ordered = list(reversed(rows))
	return {
		"labels": [str(r["date"]) for r in ordered],
		"values": [float(r["value"]) for r in ordered],
		"unit": meta["unit"] or "",
		"kpi_name": meta["title"],
	}
