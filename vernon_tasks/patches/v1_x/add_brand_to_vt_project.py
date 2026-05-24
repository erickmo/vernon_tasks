import frappe

DEFAULT_BRAND_NAME = "Default"


def execute():
	"""Backfill brand on existing VT Project rows. Creates Default VT Brand if absent. Idempotent."""
	frappe.reload_doc("brand", "doctype", "vt_brand")
	frappe.reload_doc("project", "doctype", "vt_project")

	if not frappe.db.exists("VT Brand", DEFAULT_BRAND_NAME):
		frappe.get_doc({
			"doctype": "VT Brand",
			"brand_name": DEFAULT_BRAND_NAME,
			"description": "Auto-created during brand backfill patch",
		}).insert(ignore_permissions=True)

	if not frappe.db.table_exists("VT Project"):
		return

	columns = frappe.db.sql("SHOW COLUMNS FROM `tabVT Project` LIKE 'brand'")
	if not columns:
		frappe.db.sql_ddl(
			"ALTER TABLE `tabVT Project` ADD COLUMN `brand` VARCHAR(140) NULL"
		)

	frappe.db.sql(
		"UPDATE `tabVT Project` SET `brand` = %s WHERE `brand` IS NULL OR `brand` = ''",
		(DEFAULT_BRAND_NAME,),
	)
	frappe.db.commit()
