import json

import frappe

_RATE_LIMIT_TTL = 90  # seconds — bucket expires 90s after first hit


def require_login() -> None:
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)


def rate_limit(endpoint: str, max_calls: int) -> None:
    user = frappe.session.user
    if user == "Guest":
        return
    window = frappe.utils.now()[:16]  # "YYYY-MM-DD HH:MM" — 1-minute bucket
    key = f"vt:rl:{user}:{endpoint}:{window}"
    pipe = frappe.cache().pipeline()
    pipe.incrby(key, 1)
    pipe.expire(key, _RATE_LIMIT_TTL)
    results = pipe.execute()
    count = results[0]
    if count > max_calls:
        frappe.throw("Rate limit exceeded", frappe.ValidationError)


def clamp_int(val, lo: int, hi: int, name: str = "param") -> int:
    try:
        v = int(val)
    except (TypeError, ValueError):
        frappe.throw(f"{name} must be an integer", frappe.ValidationError)
        return 0  # unreachable; satisfies type checker
    if v < lo or v > hi:
        frappe.throw(f"{name} must be between {lo} and {hi}", frappe.ValidationError)
    return v


def max_str(val, limit: int) -> str:
    if val is None:
        return ""
    return str(val)[:limit]


def parse_payload(payload) -> dict:
    """Normalize a whitelisted-method payload to a dict (accepts dict or JSON string)."""
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        frappe.throw("invalid payload", frappe.ValidationError)
    if not isinstance(parsed, dict):
        frappe.throw("payload must be an object", frappe.ValidationError)
    return parsed


def pick_fields(payload: dict, allowed: tuple) -> dict:
    """Keep only allow-listed keys from a payload — blocks mass-assignment."""
    return {k: payload[k] for k in allowed if k in payload}
