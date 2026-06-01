"""Idempotently seed the native Module Onboarding record + steps.

These mirror the canonical catalog in task/api/onboarding.py for the Workspace
surface only (the vt-home card derives its own per-user state). Seeded on
after_migrate so any fresh deploy has them; safe to re-run.

Extra required field vs. task spec: allow_roles (Table MultiSelect, reqd=1
in this Frappe version). Seeded with "System Manager" as the default role;
description on the field says "System managers are allowed by default".
"""
import frappe

_MODULE = "Task"
_ONBOARDING_NAME = "Vernon Tasks Onboarding"
_ALLOWED_ROLE = "System Manager"
_STEPS = [
    {"title": "Buat brand", "action": "Go to Page", "path": "/app/vt-brands"},
    {"title": "Buat proyek pertama", "action": "Create Entry", "reference_document": "VT Project"},
    {"title": "Tambah anggota tim", "action": "Go to Page", "path": "/app/vt-team"},
    {"title": "Buat task pertama", "action": "Create Entry", "reference_document": "VT Task"},
]


def ensure_onboarding_seeded():
    """Create the Module Onboarding + Onboarding Step records if absent."""
    if frappe.db.exists("Module Onboarding", _ONBOARDING_NAME):
        return

    step_names = []
    for step in _STEPS:
        existing = frappe.db.get_value("Onboarding Step", {"title": step["title"]}, "name")
        if existing:
            step_names.append(existing)
            continue
        # autoname=prompt on Onboarding Step — name must be set explicitly
        doc = frappe.get_doc({"doctype": "Onboarding Step", "name": step["title"], **step})
        doc.insert(ignore_permissions=True)
        step_names.append(doc.name)

    frappe.get_doc({
        "doctype": "Module Onboarding",
        "name": _ONBOARDING_NAME,
        "title": "Mulai dengan Vernon Tasks",
        "subtitle": "Empat langkah untuk menyiapkan ruang kerja Anda",
        "module": _MODULE,
        "success_message": "Ruang kerja Anda siap!",
        "documentation_url": "/app/vt-home",
        "allow_roles": [{"role": _ALLOWED_ROLE}],
        "steps": [{"step": n} for n in step_names],
    }).insert(ignore_permissions=True)
    frappe.db.commit()
