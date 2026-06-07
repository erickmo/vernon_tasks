"""Add Frappe child-table framework columns to Key Result & KPI Entry.

When a standalone doctype is converted to `istable: 1`, `bench migrate`
syncs docfields but does not add the framework child columns
(parent / parentfield / parenttype) to a pre-existing table. Fresh
installs create them at table-creation, so this patch is a no-op there;
it only repairs environments where the tables existed as standalone.
Idempotent — each column is guarded by SHOW COLUMNS.
"""
import frappe

# Doctypes converted to child tables, plus the framework columns Frappe
# normally adds only when a child table is first created.
CHILD_DOCTYPES = ("Key Result", "KPI Entry")
CHILD_COLUMNS = (
	("parent", "VARCHAR(140)"),
	("parentfield", "VARCHAR(140)"),
	("parenttype", "VARCHAR(140)"),
)


def execute():
	"""Idempotently add missing child columns to each converted table."""
	for doctype in CHILD_DOCTYPES:
		if not frappe.db.table_exists(doctype):
			continue
		table = f"tab{doctype}"
		for column, column_type in CHILD_COLUMNS:
			existing = frappe.db.sql(
				f"SHOW COLUMNS FROM `{table}` LIKE '{column}'"
			)
			if not existing:
				frappe.db.sql_ddl(
					f"ALTER TABLE `{table}` ADD COLUMN `{column}` {column_type} NULL"
				)
	frappe.db.commit()
