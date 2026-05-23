import frappe
from vernon_tasks.task.services.reports import (
    project_health, okr_pacing, team_throughput,
    my_points, project_burndown_archive, risk_log,
)

MODULES = {m.SLUG: m for m in [
    project_health, okr_pacing, team_throughput,
    my_points, project_burndown_archive, risk_log,
]}


def list_for_role(roles: set) -> list:
    out = []
    for m in MODULES.values():
        if not m.AUDIENCE or set(m.AUDIENCE) & roles:
            out.append({"slug": m.SLUG, "title": m.TITLE, "audience": list(m.AUDIENCE)})
    return out


def run(slug: str, filters: dict, user_roles: set) -> dict:
    if slug not in MODULES:
        raise ValueError(f"Unknown slug: {slug}")
    m = MODULES[slug]
    if m.AUDIENCE and not (set(m.AUDIENCE) & user_roles):
        raise frappe.PermissionError(f"Role required for {slug}: {m.AUDIENCE}")
    payload = m.run(filters)
    payload["slug"] = slug
    payload["title"] = m.TITLE
    payload["columns"] = m.COLUMNS
    return payload
