import frappe
from frappe.utils import date_diff, getdate, nowdate

from vernon_tasks.task.services import vt_item_tree as tree

DONE_PHASE = "CLOSED"


def execute(filters=None):
    columns = [
        {"fieldname": "task", "label": "Task", "fieldtype": "Link", "options": "VT Item", "width": 200},
        {"fieldname": "title", "label": "Title", "fieldtype": "Data", "width": 250},
        {"fieldname": "assigned_to", "label": "Assigned To", "fieldtype": "Link", "options": "User", "width": 150},
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Item", "width": 150},
        {"fieldname": "deadline", "label": "Deadline", "fieldtype": "Date", "width": 100},
        {"fieldname": "blocked_by", "label": "Blocked By Task", "fieldtype": "Link", "options": "VT Item", "width": 200},
        {"fieldname": "blocked_by_title", "label": "Blocker Title", "fieldtype": "Data", "width": 200},
        {"fieldname": "days_blocked", "label": "Days Blocked", "fieldtype": "Int", "width": 100},
    ]
    today = getdate(nowdate())
    blocker_cache = {}
    data = []
    tasks = tree.nodes(
        "Task",
        filters={"pdca_phase": ["!=", DONE_PHASE]},
        fields=["name", "title", "owner_user", "deadline", "modified"],
        order_by="deadline asc, modified asc",
    )
    for task in tasks:
        deps = tree.child_table_rows(task.name, "dependencies")
        if not deps:
            continue
        project = tree.project_of(task.name)
        for dep in deps:
            blocker_name = dep.get("blocked_by")
            if not blocker_name:
                continue
            blocker = _blocker_detail(blocker_name, blocker_cache)
            if not blocker or blocker.get("pdca_phase") == DONE_PHASE:
                continue
            data.append({
                "task": task.name,
                "title": task.title,
                "assigned_to": task.owner_user,
                "project": project,
                "deadline": task.deadline,
                "blocked_by": blocker_name,
                "blocked_by_title": blocker.get("title"),
                "days_blocked": date_diff(today, task.modified) if task.modified else 0,
            })
    data.sort(key=lambda row: (
        getdate(row["deadline"]) if row["deadline"] else getdate("9999-12-31"),
        -(row["days_blocked"] or 0),
    ))
    return columns, data


def _blocker_detail(name, cache):
    """Fetch (and cache) a blocker VT Item's title + pdca_phase."""
    if name not in cache:
        cache[name] = frappe.db.get_value(
            "VT Item", name, ["title", "pdca_phase"], as_dict=True
        )
    return cache[name]
