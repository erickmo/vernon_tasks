"""Drop the legacy hierarchy doctypes after the VT Item migration (P4).

Every consumer (services, APIs, pages, reports, hooks, demo data) now reads and
writes the unified `VT Item` tree; these legacy doctypes hold no live data the
app uses. Idempotent — guards on existence; deletes each DocType record and
drops its table. Ordered leaf→root so soft Link references inside the legacy set
are removed before their targets.
"""
import frappe

# Order matters: drop referencing doctypes before the ones they linked to.
LEGACY_DOCTYPES = (
	"VT Task",
	"VT Sprint",
	"Sprint Task",
	"VT Project",
	"Key Result",
	"KPI Entry",
	"KPI Definition",
	"Objective",
)


def execute():
	for doctype in LEGACY_DOCTYPES:
		if frappe.db.exists("DocType", doctype):
			# force=True bypasses linked-doc checks — all surviving Links were
			# repointed to VT Item in P2/P3/P4; remaining links are internal to
			# this legacy set, dropped together here.
			frappe.delete_doc("DocType", doctype, force=True, ignore_missing=True)
		frappe.db.sql_ddl(f"DROP TABLE IF EXISTS `tab{doctype}`")
	frappe.db.commit()
