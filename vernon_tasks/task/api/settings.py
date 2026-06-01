"""VT Settings read/write API for the vt-settings manager hub.

Exposes get_settings/save_settings for the desk Page `vt-settings`.
Manager-only: every entry is guarded by _require_manager().
"""
from __future__ import annotations

from typing import Any

import frappe

VT_MANAGER_ROLE = "VT Manager"
SETTINGS_DOCTYPE = "VT Settings"

BRANDING_FIELDS = ("login_headline", "login_subtext")
SCORING_FIELDS = (
    "weight_multiplier",
    "early_bonus_rate",
    "late_penalty_rate",
    "revision_deduct_rate",
    "default_daily_target_hours",
)
NAVBAR_FIELDS = ("label", "route", "icon", "enabled", "is_group", "parent_group", "role_restriction")


# ── helpers ──────────────────────────────────────────────────────────────────


def _require_manager() -> None:
    """Module helper (not whitelisted) so both entries share one guard.

    VT Settings drives branding/scoring/navbar globally, so only a
    VT Manager may read or mutate it. Raises PermissionError otherwise.
    """
    if VT_MANAGER_ROLE not in frappe.get_roles():
        raise frappe.PermissionError(f"{VT_MANAGER_ROLE} role required.")


def _as_data(value: Any) -> Any:
    """Normalise an arg that JS may pass as a JSON string into dict/list."""
    if isinstance(value, (dict, list)):
        return value
    return frappe.parse_json(value) if value else None


def _read_navbar(doc: Any) -> list[dict]:
    """Project the navbar_items child rows into plain dicts for the client."""
    return [
        {
            "label": row.label,
            "route": row.route,
            "icon": row.icon,
            "enabled": row.enabled,
            "is_group": row.is_group or 0,
            "parent_group": row.parent_group or "",
            "role_restriction": row.role_restriction or "",
            "idx": row.idx,
        }
        for row in (doc.navbar_items or [])
    ]


def _apply_branding(doc: Any, data: dict | None) -> None:
    """Set only known branding fields from incoming data."""
    if not data:
        return
    for field in BRANDING_FIELDS:
        if field in data:
            doc.set(field, data[field])


def _apply_scoring(doc: Any, data: dict | None) -> None:
    """Set only known scoring float fields from incoming data."""
    if not data:
        return
    for field in SCORING_FIELDS:
        if field in data:
            doc.set(field, data[field])


def _apply_navbar(doc: Any, rows: list | None) -> None:
    """Replace the navbar_items child table with the given ordered rows."""
    if rows is None:
        return
    doc.set(
        "navbar_items",
        [{field: row.get(field) for field in NAVBAR_FIELDS} for row in rows],
    )


# ── whitelisted entries ──────────────────────────────────────────────────────


@frappe.whitelist()
def get_settings() -> dict:
    """Return current VT Settings (navbar, branding, scoring) for a manager."""
    _require_manager()
    doc = frappe.get_single(SETTINGS_DOCTYPE)
    return {
        "navbar_items": _read_navbar(doc),
        "branding": {field: doc.get(field) for field in BRANDING_FIELDS},
        "scoring": {field: doc.get(field) for field in SCORING_FIELDS},
    }


@frappe.whitelist()
def save_settings(navbar_items=None, branding=None, scoring=None) -> dict:
    """Persist navbar/branding/scoring changes to the VT Settings single."""
    _require_manager()
    doc = frappe.get_single(SETTINGS_DOCTYPE)
    _apply_branding(doc, _as_data(branding))
    _apply_scoring(doc, _as_data(scoring))
    _apply_navbar(doc, _as_data(navbar_items))
    doc.save()
    return {"ok": True}
