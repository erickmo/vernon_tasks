import frappe

from vernon_tasks.task.services import vt_item_tree as tree

TASK_DONE_PHASE = "CLOSED"
SPRINT_FIELDS = ["name", "title", "start_date", "end_date"]
TASK_FIELDS = ["weight", "pdca_phase"]


def execute(filters=None):
    filters = filters or {}
    columns = [
        {"fieldname": "sprint", "label": "Sprint", "fieldtype": "Link", "options": "VT Item", "width": 160},
        {"fieldname": "sprint_title", "label": "Title", "fieldtype": "Data", "width": 200},
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Item", "width": 160},
        {"fieldname": "start_date", "label": "Start", "fieldtype": "Date", "width": 100},
        {"fieldname": "end_date", "label": "End", "fieldtype": "Date", "width": 100},
        {"fieldname": "total_weight", "label": "Planned Wt", "fieldtype": "Float", "width": 110},
        {"fieldname": "done_weight", "label": "Done Wt", "fieldtype": "Float", "width": 100},
        {"fieldname": "velocity_pct", "label": "Velocity %", "fieldtype": "Percent", "width": 100},
    ]
    project = filters.get("project")
    if project:
        sprints = tree.children(project, "Sprint", fields=SPRINT_FIELDS,
            order_by="start_date desc")
    else:
        sprints = tree.nodes("Sprint", fields=SPRINT_FIELDS,
            order_by="start_date desc")
    data = []
    for s in sprints:
        tasks = tree.children(s.name, "Task", fields=TASK_FIELDS)
        total_weight = sum((t.weight or 0) for t in tasks)
        done_weight = sum((t.weight or 0) for t in tasks
            if t.pdca_phase == TASK_DONE_PHASE)
        velocity_pct = round(done_weight / total_weight * 100, 1) if total_weight else 0
        data.append({
            "sprint": s.name,
            "sprint_title": s.title,
            "project": tree.project_of(s.name),
            "start_date": s.start_date,
            "end_date": s.end_date,
            "total_weight": total_weight,
            "done_weight": done_weight,
            "velocity_pct": velocity_pct,
        })
    return columns, data
