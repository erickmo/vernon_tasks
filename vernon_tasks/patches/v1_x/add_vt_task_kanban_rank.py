import frappe


def execute():
	"""Add kanban_rank column to VT Task. No backfill — populated lazily on first board load."""
	if not frappe.db.has_column("tabVT Task", "kanban_rank"):
		frappe.db.sql_ddl(
			"ALTER TABLE `tabVT Task` ADD COLUMN `kanban_rank` DOUBLE NULL"
		)
	frappe.db.commit()
