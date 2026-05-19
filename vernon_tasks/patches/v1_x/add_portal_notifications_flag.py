import frappe


def execute():
    """Add portal_notifications_enabled Check field to VT Settings. Idempotent."""
    frappe.reload_doc("vt_settings", "doctype", "vt_settings")
    if not frappe.db.table_exists("VT Settings"):
        return
    columns = frappe.db.sql(
        "SHOW COLUMNS FROM `tabVT Settings` LIKE 'portal_notifications_enabled'"
    )
    if not columns:
        frappe.db.sql_ddl(
            "ALTER TABLE `tabVT Settings`"
            " ADD COLUMN `portal_notifications_enabled` TINYINT(1) NOT NULL DEFAULT 0"
        )
    frappe.db.commit()
