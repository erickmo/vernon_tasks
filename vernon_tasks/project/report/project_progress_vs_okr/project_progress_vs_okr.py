import frappe

from vernon_tasks.task.services import vt_item_tree as tree

# Task completion is tracked by pdca_phase == "CLOSED" on the VT Item Task node
# (the legacy "DONE" phase no longer exists after the VT Item migration).
DONE_PHASE = "CLOSED"


def execute(filters=None):
    columns = [
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Item", "width": 180},
        {"fieldname": "title", "label": "Title", "fieldtype": "Data", "width": 220},
        {"fieldname": "pdca_phase", "label": "PDCA", "fieldtype": "Data", "width": 80},
        {"fieldname": "total_tasks", "label": "Total Tasks", "fieldtype": "Int", "width": 100},
        {"fieldname": "done_tasks", "label": "Done Tasks", "fieldtype": "Int", "width": 100},
        {"fieldname": "completion_pct", "label": "Completion %", "fieldtype": "Percent", "width": 120},
        {"fieldname": "objective", "label": "OKR Objective", "fieldtype": "Link", "options": "VT Item", "width": 180},
        {"fieldname": "okr_progress", "label": "OKR Progress %", "fieldtype": "Percent", "width": 120},
    ]
    # Project nodes (VT Item node_type="Project"); the legacy flat "objective"
    # field is gone — the linked OKR is the project's nearest OKR ancestor.
    projects = tree.nodes("Project", fields=["name", "title", "pdca_phase"], order_by="start_date DESC")
    data = []
    for proj in projects:
        # Nested-set descendants span skipped levels (Tasks under Sprints too),
        # replacing the flat VT Task.project filter.
        total = len(tree.descendants(proj.name, node_type="Task"))
        done = len(tree.descendants(proj.name, node_type="Task", filters={"pdca_phase": DONE_PHASE}))
        pct = round((done / total * 100), 1) if total else 0
        objective = tree.ancestor_of_type(proj.name, "OKR")
        okr_progress = _objective_progress(objective) if objective else 0.0
        data.append({"project": proj.name, "title": proj.title, "pdca_phase": proj.pdca_phase,
                     "total_tasks": total, "done_tasks": done, "completion_pct": pct,
                     "objective": objective, "okr_progress": okr_progress})
    return columns, data


def _objective_progress(objective):
    """Mean of min(current/target, 1.0) * 100 over Key Results with target > 0.

    Reads the OKR node's `key_results` child table (VT Item Key Result rows)
    instead of the legacy flat "Key Result" doctype. Mirrors the canonical
    aggregate_kr_progress formula: clamp ratio at 1.0, round once, 0.0 when no
    Key Result has a positive target.
    """
    rows = tree.child_table_rows(objective, "key_results")
    valid = [(r.get("current_value"), r.get("target_value")) for r in rows
             if r.get("target_value") and r.get("target_value") > 0]
    if not valid:
        return 0.0
    total = sum(min((c or 0) / t, 1.0) for (c, t) in valid)
    return round((total / len(valid)) * 100, 2)
