import frappe


def execute():
	"""Add kanban_rank column to VT Task. No backfill — populated lazily on first board load."""
	frappe.reload_doc("task", "doctype", "vt_task")
	columns = frappe.db.sql("SHOW COLUMNS FROM `tabVT Task` LIKE 'kanban_rank'")
	if not columns:
		frappe.db.sql_ddl(
			"ALTER TABLE `tabVT Task` ADD COLUMN `kanban_rank` DOUBLE NULL"
		)
	frappe.db.commit()
