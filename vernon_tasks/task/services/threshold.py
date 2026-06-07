import frappe

THRESHOLD_KEYS = ("blocked_days", "slip_pct", "capacity_pct")

_PROJECT_FIELD = {
    "blocked_days": "blocked_days_threshold",
    "slip_pct": "slip_pct_threshold",
    "capacity_pct": "capacity_pct_threshold",
}

_SETTINGS_FIELD = {
    "blocked_days": "default_blocked_days_threshold",
    "slip_pct": "default_slip_pct_threshold",
    "capacity_pct": "default_capacity_pct_threshold",
}

_HARDCODED_FALLBACK = {
    "blocked_days": 3,
    "slip_pct": 20.0,
    "capacity_pct": 120.0,
}


def get_project_threshold(project: str | None, key: str) -> float:
    if key not in THRESHOLD_KEYS:
        raise ValueError(f"Unknown threshold key: {key}")

    if project:
        # project is now a VT Item node (node_type="Project"); threshold
        # fields are preserved on the node, so a direct lookup suffices —
        # no tree traversal needed.
        val = frappe.db.get_value("VT Item", project, _PROJECT_FIELD[key])
        if val not in (None, 0, ""):
            return float(val)

    settings = frappe.get_single("VT Settings")
    val = getattr(settings, _SETTINGS_FIELD[key], None)
    if val not in (None, 0, ""):
        return float(val)

    return float(_HARDCODED_FALLBACK[key])
