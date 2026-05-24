"""Portal Brands endpoints — list, search, create, update, delete VT Brand."""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login

BRAND_DOCTYPE = "VT Brand"
EDITABLE_BRAND_FIELDS = ("brand_name", "logo", "description")
REQUIRED_CREATE_FIELDS = ("brand_name",)
BRAND_SEARCH_LIMIT = 20


def _parse_payload(payload: Any) -> dict:
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    try:
        import json

        return json.loads(payload) or {}
    except (TypeError, ValueError):
        raise frappe.ValidationError("invalid payload")


def _whitelisted_fields(payload: dict) -> dict:
    return {k: payload[k] for k in EDITABLE_BRAND_FIELDS if k in payload}


def _serialize(doc) -> dict:
    return {
        "id": doc.name,
        "brand_name": doc.brand_name,
        "logo": doc.logo,
        "description": doc.description,
    }


@frappe.whitelist()
def get_brand_permissions() -> dict:
    require_login()
    return {
        "can_create": bool(frappe.has_permission(BRAND_DOCTYPE, "create")),
        "can_write": bool(frappe.has_permission(BRAND_DOCTYPE, "write")),
        "can_delete": bool(frappe.has_permission(BRAND_DOCTYPE, "delete")),
    }


@frappe.whitelist()
def list_brands(search: str = "") -> list[dict]:
    require_login()
    if not frappe.has_permission(BRAND_DOCTYPE, "read"):
        raise frappe.PermissionError
    filters: dict = {}
    q = max_str(search or "", 100).strip()
    if q:
        filters["brand_name"] = ["like", f"%{q}%"]
    rows = frappe.get_all(
        BRAND_DOCTYPE,
        fields=["name", "brand_name", "logo", "description"],
        filters=filters,
        order_by="brand_name ASC",
        limit_page_length=500,
    )
    return [
        {
            "id": r.get("name"),
            "brand_name": r.get("brand_name"),
            "logo": r.get("logo"),
            "description": r.get("description"),
        }
        for r in rows
    ]


@frappe.whitelist()
def search_brands(query: str = "", limit: int = BRAND_SEARCH_LIMIT) -> list[dict]:
    """Lightweight picker endpoint returning {id, brand_name, logo}."""
    require_login()
    q = max_str(query or "", 100).strip()
    try:
        lim = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        lim = BRAND_SEARCH_LIMIT
    filters: dict = {}
    if q:
        filters["brand_name"] = ["like", f"%{q}%"]
    rows = frappe.get_all(
        BRAND_DOCTYPE,
        fields=["name", "brand_name", "logo"],
        filters=filters,
        order_by="brand_name ASC",
        limit_page_length=lim,
    )
    return [
        {"id": r.get("name"), "brand_name": r.get("brand_name"), "logo": r.get("logo")}
        for r in rows
    ]


@frappe.whitelist()
def get_brand(brand_id: str) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "read", brand_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(BRAND_DOCTYPE, brand_id)
    return _serialize(doc)


@frappe.whitelist()
def create_brand(payload: str | dict) -> dict:
    require_login()
    if not frappe.has_permission(BRAND_DOCTYPE, "create"):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    missing = [f for f in REQUIRED_CREATE_FIELDS if not data.get(f)]
    if missing:
        raise frappe.ValidationError(f"missing required fields: {', '.join(missing)}")
    doc = frappe.get_doc({"doctype": BRAND_DOCTYPE, **data})
    doc.insert(ignore_permissions=False)
    return _serialize(doc)


@frappe.whitelist()
def update_brand(brand_id: str, payload: str | dict) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "write", doc=brand_id):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    if not data:
        return _serialize(frappe.get_doc(BRAND_DOCTYPE, brand_id))
    doc = frappe.get_doc(BRAND_DOCTYPE, brand_id)
    other_changes = False
    for field, value in data.items():
        if field == "brand_name":
            if value and value != doc.name:
                frappe.rename_doc(BRAND_DOCTYPE, doc.name, value, force=False)
                doc = frappe.get_doc(BRAND_DOCTYPE, value)
            continue
        setattr(doc, field, value)
        other_changes = True
    if other_changes:
        doc.save(ignore_permissions=False)
    return _serialize(doc)


@frappe.whitelist()
def delete_brand(brand_id: str) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "delete", doc=brand_id):
        raise frappe.PermissionError
    # Block delete if linked by any VT Project
    in_use = frappe.db.count("VT Project", {"brand": brand_id})
    if in_use:
        raise frappe.ValidationError(
            f"Brand is linked to {in_use} project(s); reassign before deleting"
        )
    frappe.delete_doc(BRAND_DOCTYPE, brand_id, ignore_permissions=False)
    return {"deleted": brand_id}
