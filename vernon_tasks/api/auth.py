import frappe

ROLE_TO_PERMISSIONS = {
    "System Manager":   ["okr.read", "okr.write", "project.read", "project.write", "workforce.read", "report.read"],
    "Projects Manager": ["okr.read", "project.read", "project.write", "workforce.read", "report.read"],
    "HR Manager":       ["workforce.read", "report.read"],
    "Employee":         [],
}

@frappe.whitelist()
def get_user_permissions():
    user = frappe.session.user
    if user == "Guest":
        return {"permissions": [], "roles": []}
    roles = frappe.get_roles(user)
    perms = set()
    for role in roles:
        perms.update(ROLE_TO_PERMISSIONS.get(role, []))
    return {"permissions": sorted(perms), "roles": roles}
