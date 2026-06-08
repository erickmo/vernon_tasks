"""Drop stale Workspace nav rows that point at the dropped legacy doctypes.

The unified `VT Item` migration (P4) removed the legacy hierarchy doctypes, but
sites installed before the workspace fixture was repointed still carry
`Workspace Link` / `Workspace Shortcut` rows whose `link_to` targets a now-gone
doctype — those render as dead nav entries. The shipped fixture
(task/workspace/vernon_tasks/vernon_tasks.json) already collapses these into the
`VT Item` doctype / `vt-okr` / `vt-projects` pages on a fresh sync; this patch
cleans up the DB rows that an in-place migrate leaves behind.

Idempotent: deleting on a `link_to IN (...)` filter is a no-op once the rows are
gone, so it is safe to re-run.
"""
import frappe

# The 8 doctypes dropped by the VT Item migration; mirror of
# patches.v1_x.drop_legacy_hierarchy_doctypes.LEGACY_DOCTYPES.
LEGACY_DOCTYPES = (
	"Objective",
	"Key Result",
	"KPI Definition",
	"KPI Entry",
	"VT Project",
	"VT Sprint",
	"VT Task",
	"Sprint Task",
)


def execute():
	"""Delete Workspace Link/Shortcut rows targeting dropped doctypes, then
	clear cache so the desk rebuilds nav from the surviving rows."""
	frappe.db.delete("Workspace Link", {"link_to": ["in", LEGACY_DOCTYPES]})
	frappe.db.delete("Workspace Shortcut", {"link_to": ["in", LEGACY_DOCTYPES]})
	frappe.db.commit()
	frappe.clear_cache()
