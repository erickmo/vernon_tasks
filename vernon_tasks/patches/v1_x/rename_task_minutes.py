"""Convert VT Task / Task Schedule Entry time fields from hours to minutes,
make point fields integer, and drop the obsolete VT Task.linked_kr column.

Why a patch: Frappe does not auto-rename a DB column when a doctype field's
fieldname changes in JSON — it would create the new column and orphan the old
one (losing data). We rename in place via DDL, scale the existing values ×60
(hours → minutes), then reload the doctypes so the new Int schema is applied.

Idempotent: each step is guarded by SHOW COLUMNS so a re-run is a no-op.
"""
import frappe

MINUTES_PER_HOUR = 60

TASK_TABLE = "tabVT Task"
SCHEDULE_TABLE = "tabTask Schedule Entry"

# (old_column, new_column) — duration fields rescaled ×60 then cast to INT.
TASK_DURATION_RENAMES = (
	("estimated_hours", "estimated_minutes"),
	("actual_hours", "actual_minutes"),
	("review_estimated_hours", "review_estimated_minutes"),
)

# Schedule durations stay DOUBLE (per-day allocation can be fractional minutes).
SCHEDULE_DURATION_RENAMES = (
	("allocated_hours", "allocated_minutes"),
	("hours_planned", "minutes_planned"),
)

# Point fields: just widen-to-INT, no rescale.
TASK_INT_POINT_COLUMNS = ("base_points", "earned_points", "leader_override_points")


def _has_column(table: str, column: str) -> bool:
	return bool(frappe.db.sql(f"SHOW COLUMNS FROM `{table}` LIKE %s", column))


def _rename_duration_to_minutes(table: str, old: str, new: str, as_int: bool) -> None:
	"""Rename old→new, multiply existing values ×60, optionally cast to INT."""
	if _has_column(table, new) or not _has_column(table, old):
		return
	# Step 1: rename keeping DOUBLE so the ×60 scaling keeps precision.
	frappe.db.sql_ddl(f"ALTER TABLE `{table}` CHANGE `{old}` `{new}` DOUBLE NULL")
	frappe.db.sql(
		f"UPDATE `{table}` SET `{new}` = `{new}` * %s WHERE `{new}` IS NOT NULL",
		MINUTES_PER_HOUR,
	)
	if as_int:
		frappe.db.sql_ddl(
			f"ALTER TABLE `{table}` MODIFY `{new}` INT NOT NULL DEFAULT 0"
		)


def _cast_to_int(table: str, column: str) -> None:
	if not _has_column(table, column):
		return
	frappe.db.sql_ddl(f"ALTER TABLE `{table}` MODIFY `{column}` INT NOT NULL DEFAULT 0")


def _drop_column(table: str, column: str) -> None:
	if _has_column(table, column):
		frappe.db.sql_ddl(f"ALTER TABLE `{table}` DROP COLUMN `{column}`")


def execute():
	for old, new in TASK_DURATION_RENAMES:
		_rename_duration_to_minutes(TASK_TABLE, old, new, as_int=True)
	for old, new in SCHEDULE_DURATION_RENAMES:
		_rename_duration_to_minutes(SCHEDULE_TABLE, old, new, as_int=False)
	for column in TASK_INT_POINT_COLUMNS:
		_cast_to_int(TASK_TABLE, column)
	_drop_column(TASK_TABLE, "linked_kr")

	frappe.reload_doc("task", "doctype", "vt_task")
	frappe.reload_doc("task", "doctype", "task_schedule_entry")
	frappe.db.commit()
