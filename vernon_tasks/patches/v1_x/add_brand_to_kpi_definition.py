import frappe

DEFAULT_BRAND_NAME = "Default"


def execute():
	"""Backfill brand on KPI Definition rows. Pulls from linked Objective when available,
	falls back to Default VT Brand. Idempotent."""
	frappe.reload_doc("brand", "doctype", "vt_brand")
	frappe.reload_doc("okr", "doctype", "kpi_definition")

	if not frappe.db.exists("VT Brand", DEFAULT_BRAND_NAME):
		frappe.get_doc({
			"doctype": "VT Brand",
			"brand_name": DEFAULT_BRAND_NAME,
			"description": "Auto-created during brand backfill patch",
		}).insert(ignore_permissions=True)

	if not frappe.db.table_exists("KPI Definition"):
		return

	columns = frappe.db.sql("SHOW COLUMNS FROM `tabKPI Definition` LIKE 'brand'")
	if not columns:
		frappe.db.sql_ddl(
			"ALTER TABLE `tabKPI Definition` ADD COLUMN `brand` VARCHAR(140) NULL"
		)

	frappe.db.sql(
		"""
		UPDATE `tabKPI Definition` k
		LEFT JOIN `tabObjective` o ON o.name = k.objective
		SET k.brand = COALESCE(o.brand, %s)
		WHERE k.brand IS NULL OR k.brand = ''
		""",
		(DEFAULT_BRAND_NAME,),
	)
	frappe.db.commit()
