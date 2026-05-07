import frappe


def execute(filters=None):
    columns = [
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Project", "width": 180},
        {"fieldname": "title", "label": "Title", "fieldtype": "Data", "width": 220},
        {"fieldname": "pdca_phase", "label": "PDCA", "fieldtype": "Data", "width": 80},
        {"fieldname": "total_tasks", "label": "Total Tasks", "fieldtype": "Int", "width": 100},
        {"fieldname": "done_tasks", "label": "Done Tasks", "fieldtype": "Int", "width": 100},
        {"fieldname": "completion_pct", "label": "Completion %", "fieldtype": "Percent", "width": 120},
        {"fieldname": "objective", "label": "OKR Objective", "fieldtype": "Link", "options": "Objective", "width": 180},
        {"fieldname": "okr_progress", "label": "OKR Progress %", "fieldtype": "Percent", "width": 120},
    ]
    projects = frappe.get_all("VT Project", fields=["name","title","pdca_phase","objective"], order_by="start_date DESC")
    data = []
    for proj in projects:
        total = frappe.db.count("VT Task", {"project": proj.name})
        done = frappe.db.count("VT Task", {"project": proj.name, "pdca_phase": "DONE"})
        pct = round((done / total * 100), 1) if total else 0
        okr_progress = 0.0
        if proj.objective:
            from vernon_tasks.okr.doctype.objective.objective import get_objective_progress
            okr_progress = get_objective_progress(proj.objective)
        data.append({"project": proj.name, "title": proj.title, "pdca_phase": proj.pdca_phase,
                     "total_tasks": total, "done_tasks": done, "completion_pct": pct,
                     "objective": proj.objective, "okr_progress": okr_progress})
    return columns, data
