"""VT Task project-board mutations — drag / quick-add / inline-edit endpoints.

Layer: HTTP entrypoints (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First
rule). Each whitelist is a thin wrapper that delegates all state-machine
enforcement to the VT Task controller via ``doc.save()`` / ``doc.insert()`` —
the controller's ``validate()`` owns PDCA↔Kanban sync and transition legality.

Authz is project-level (admin / leader / member of the task's project), reusing
the dashboard access guard; we then save with ``ignore_permissions`` because the
project-membership check IS the board's authorization contract (a project member
may lack a raw write permission on VT Task).

Source of truth: docs/superpowers/specs/2026-05-31-project-detail-kanban-design.html.
"""
import frappe
from frappe.utils import today

from vernon_tasks.task.api.dashboard import _assert_project_access, _is_admin
from vernon_tasks.task.api.security import max_str, rate_limit
from vernon_tasks.task.doctype.vt_task.vt_task import (
    BOARD_COLUMNS,
    KANBAN_BLOCKED,
    KANBAN_PDCA_MAP,
    PDCA_KANBAN_MAP,
)

TASK_DOCTYPE = "VT Task"
PROJECT_DOCTYPE = "VT Project"
TEAM_MEMBER_DOCTYPE = "Project Team Member"
TASK_TITLE_MAX_LEN = 200

# Inline-edit allow-list — guards against mass-assignment via patch_task.
PATCHABLE_FIELDS = ("priority", "assigned_to", "deadline")

# Modal-edit allow-list — the full editable field set surfaced by the create/edit
# form dialogs. Deliberately EXCLUDES pdca_phase / kanban_status / project so the
# PDCA state machine stays reachable only through move_task, and project/phase
# can't be smuggled in via a values payload. Also excludes server-computed
# read-only fields (kanban_rank, completion_date, actual_minutes, *_points,
# revision_count, next_occurrence, parent_task, risk_flag) — those are never
# client-set. risk_flag is surfaced by risk_evaluator and is read-only.
EDITABLE_FIELDS = (
    "title", "priority", "assigned_to", "start_date", "deadline",
    "sprint",
    "estimated_minutes", "review_estimated_minutes", "review_scheduled_date",
    "weight", "leader_override_points", "override_reason",
    "is_recurring", "recurring_rule",
    "dependencies", "schedule_entries",
)

# Child-table fields — applied as a row list (not a scalar set/null).
TABLE_FIELDS = ("dependencies", "schedule_entries")

# Governance fields — only the project leader or an admin may set them, mirroring
# the scoring policy (a points override is an auditable leader action).
LEADER_ONLY_FIELDS = ("leader_override_points", "override_reason")

# Fields whose doctype default must survive an empty payload value. weight has a
# default of 1 and the controller enforces weight > 0, so an empty weight from
# the modal means "leave as-is", never "null it".
SKIP_IF_EMPTY_FIELDS = ("weight",)

# Editable scalar set returned by get_task to hydrate the edit modal (tables are
# appended separately as row lists).
GET_TASK_SCALAR_FIELDS = tuple(f for f in EDITABLE_FIELDS if f not in TABLE_FIELDS)

# Quick-add is offered only on PDCA columns; Blocked is a flag, Done is terminal.
DONE_COLUMN = PDCA_KANBAN_MAP["DONE"]
QUICK_ADD_COLUMNS = tuple(
    col for col in PDCA_KANBAN_MAP.values() if col != DONE_COLUMN
)


def _get_board_task(task_id: str):
    """Load a task after asserting project-level board access; reject submitted.

    Returns the VT Task document. Raises PermissionError when the caller has no
    access to the task's project, or ValidationError when the doc is submitted
    (Frappe forbids editing a docstatus==1 document — surface it cleanly).
    """
    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Task tidak ditemukan", frappe.DoesNotExistError)
    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    _assert_project_access(doc.project, frappe.session.user)
    if doc.docstatus == 1:
        frappe.throw(
            "Task sudah disubmit, tidak bisa diubah dari papan",
            frappe.ValidationError,
        )
    return doc


def _assert_team_member(project_id: str, user: str) -> None:
    """assigned_to must be the leader or a team member of the project."""
    leader = frappe.db.get_value(PROJECT_DOCTYPE, project_id, "project_leader")
    if user == leader:
        return
    is_member = frappe.db.exists(
        TEAM_MEMBER_DOCTYPE,
        {"parent": project_id, "parenttype": PROJECT_DOCTYPE, "user": user},
    )
    if not is_member:
        frappe.throw(f"{user} bukan anggota tim proyek", frappe.ValidationError)


def _is_project_leader(project_id: str, user: str) -> bool:
    """True when the user is an admin or the project's leader.

    Gate for LEADER_ONLY_FIELDS — a plain team member must not set governance
    fields (points override) even though they can edit other task fields.
    """
    if _is_admin():
        return True
    return user == frappe.db.get_value(PROJECT_DOCTYPE, project_id, "project_leader")


def _apply_move(doc, to_column: str) -> None:
    """Translate a board drop into field changes; legality is enforced later.

    Decides WHICH field moves; the controller's validate() enforces whether the
    move is legal. Three cases:
      - Blocked column → set the orthogonal Blocked flag (idempotent).
      - Blocked → PDCA → un-block: restore status from the real phase, NOT a
        transition; the dropped-on column is ignored (card snaps to its phase).
      - PDCA → PDCA → set pdca_phase from the reverse map; stamp completion_date
        when entering Done (on_submit does not fire on a plain save()).
    """
    if to_column == KANBAN_BLOCKED:
        doc.kanban_status = KANBAN_BLOCKED
        return
    if doc.kanban_status == KANBAN_BLOCKED:
        doc.kanban_status = PDCA_KANBAN_MAP[doc.pdca_phase]
        return
    doc.pdca_phase = KANBAN_PDCA_MAP[to_column]
    if to_column == DONE_COLUMN:
        doc.completion_date = today()


@frappe.whitelist()
def move_task(task_id: str, to_column: str) -> dict:
    """Move a task to a board column. Controller enforces PDCA legality."""
    rate_limit("move_task", 60)
    if to_column not in BOARD_COLUMNS:
        frappe.throw(f"Kolom tidak valid: {to_column}", frappe.ValidationError)
    doc = _get_board_task(task_id)
    _apply_move(doc, to_column)
    doc.save(ignore_permissions=True)
    return {"ok": True, "task_id": doc.name, "kanban_status": doc.kanban_status}


def _parse_values(values) -> dict:
    """Coerce a dialog payload (JSON string from the browser, or dict) to a dict."""
    if isinstance(values, str):
        return frappe.parse_json(values) or {}
    return values or {}


def _apply_editable(doc, values: dict) -> None:
    """Map an allow-listed values payload onto a board task.

    Field-application + per-field guards only; all state-machine, date-order,
    number, recurring and dependency rules stay in the VT Task controller's
    ``validate()`` (runs on the caller's ``save()``/``insert()``). Guards here:
      - reject any key outside EDITABLE_FIELDS (block mass-assignment),
      - gate LEADER_ONLY_FIELDS to admin / project leader,
      - re-check team membership when (re)assigning,
      - cap title length,
      - apply child tables as row lists,
      - skip SKIP_IF_EMPTY_FIELDS when empty so doctype defaults survive.
    """
    for field, val in values.items():
        if field not in EDITABLE_FIELDS:
            frappe.throw(f"Field tidak boleh diubah: {field}", frappe.ValidationError)
        if field in LEADER_ONLY_FIELDS and val not in (None, "", 0):
            if not _is_project_leader(doc.project, frappe.session.user):
                frappe.throw(
                    f"Hanya leader proyek yang boleh mengubah: {field}",
                    frappe.ValidationError,
                )
        if field in TABLE_FIELDS:
            doc.set(field, val or [])
            continue
        if field in SKIP_IF_EMPTY_FIELDS and val in (None, ""):
            continue  # preserve doctype default (e.g. weight=1)
        if field == "assigned_to" and val:
            _assert_team_member(doc.project, val)
        if field == "title" and val:
            val = max_str(val, TASK_TITLE_MAX_LEN)
        doc.set(field, val if val not in (None, "") else None)


@frappe.whitelist()
def create_task(project_id: str, title: str, column: str, values=None) -> dict:
    """Create a task in a board column (PDCA columns only).

    ``values`` is an optional dialog payload of EDITABLE_FIELDS (priority,
    assignee, dates). ``title`` is taken from the positional arg only — any
    ``title`` inside ``values`` is ignored to keep a single source of truth.
    """
    rate_limit("create_task", 30)
    if column not in QUICK_ADD_COLUMNS:
        frappe.throw(f"Tidak bisa quick-add ke kolom {column}", frappe.ValidationError)
    _assert_project_access(project_id, frappe.session.user)
    doc = frappe.get_doc({
        "doctype": TASK_DOCTYPE,
        "project": project_id,
        "title": max_str(title, TASK_TITLE_MAX_LEN),
        "pdca_phase": KANBAN_PDCA_MAP[column],
    })
    extra = _parse_values(values)
    extra.pop("title", None)  # title is positional-only; ignore any in payload
    _apply_editable(doc, extra)
    doc.insert(ignore_permissions=True)
    return {"ok": True, "task_id": doc.name, "kanban_status": doc.kanban_status}


def _serialize_table(rows) -> list[dict]:
    """Flatten child rows to plain dicts (drop Frappe metadata) for the modal."""
    return [
        {k: v for k, v in row.as_dict().items() if not k.startswith("__")}
        for row in (rows or [])
    ]


@frappe.whitelist()
def get_task(task_id: str) -> dict:
    """Return the full editable field set + child tables to hydrate the edit modal.

    The board card carries only display fields; opening the edit form needs every
    EDITABLE_FIELD plus the dependency / schedule rows. Guarded by the same
    project-level access check as every other board mutation.
    """
    doc = _get_board_task(task_id)
    data = {field: doc.get(field) for field in GET_TASK_SCALAR_FIELDS}
    for field in TABLE_FIELDS:
        data[field] = _serialize_table(doc.get(field))
    return data


@frappe.whitelist()
def update_task(task_id: str, values) -> dict:
    """Save several allow-listed fields at once from the edit modal.

    Thin entry: delegates field-order/PDCA/date validation to the controller via
    ``doc.save()``. ``values`` is a JSON string or dict of EDITABLE_FIELDS.
    """
    rate_limit("update_task", 30)
    doc = _get_board_task(task_id)
    _apply_editable(doc, _parse_values(values))
    doc.save(ignore_permissions=True)
    return {"ok": True, "task_id": doc.name, "kanban_status": doc.kanban_status}


@frappe.whitelist()
def patch_task(task_id: str, field: str, value=None) -> dict:
    """Inline-edit one allowed card field (priority / assigned_to / deadline)."""
    rate_limit("patch_task", 30)
    if field not in PATCHABLE_FIELDS:
        frappe.throw(f"Field tidak boleh diubah: {field}", frappe.ValidationError)
    doc = _get_board_task(task_id)
    if field == "assigned_to" and value:
        _assert_team_member(doc.project, value)
    doc.set(field, value or None)
    doc.save(ignore_permissions=True)
    return {"ok": True}
