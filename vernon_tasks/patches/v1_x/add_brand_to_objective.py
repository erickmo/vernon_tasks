import frappe

DEFAULT_BRAND_NAME = "Default"


def execute():
	"""Backfill brand on existing Objective rows. Creates Default VT Brand if absent. Idempotent."""
	frappe.reload_doc("brand", "doctype", "vt_brand")
	frappe.reload_doc("okr", "doctype", "objective")

	if not frappe.db.exists("VT Brand", DEFAULT_BRAND_NAME):
		frappe.get_doc({
			"doctype": "VT Brand",
			"brand_name": DEFAULT_BRAND_NAME,
			"description": "Auto-created during brand backfill patch",
		}).insert(ignore_permissions=True)

	if not frappe.db.table_exists("Objective"):
		return

	columns = frappe.db.sql("SHOW COLUMNS FROM `tabObjective` LIKE 'brand'")
	if not columns:
		frappe.db.sql_ddl(
			"ALTER TABLE `tabObjective` ADD COLUMN `brand` VARCHAR(140) NULL"
		)

	frappe.db.sql(
		"UPDATE `tabObjective` SET `brand` = %s WHERE `brand` IS NULL OR `brand` = ''",
		(DEFAULT_BRAND_NAME,),
	)
	frappe.db.commit()
