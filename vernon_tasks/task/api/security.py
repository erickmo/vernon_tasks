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
    count = frappe.cache().incrby(key, 1)
    frappe.cache().expire(key, _RATE_LIMIT_TTL)
    if count > max_calls:
        frappe.throw("Rate limit exceeded", frappe.ValidationError)


def clamp_int(val, lo: int, hi: int, name: str = "param") -> int:
    try:
        v = int(val)
    except (TypeError, ValueError):
        frappe.throw(f"{name} must be an integer", frappe.ValidationError)
    if v < lo or v > hi:
        frappe.throw(f"{name} must be between {lo} and {hi}", frappe.ValidationError)
    return v


def max_str(val, limit: int) -> str:
    if not val:
        return ""
    return str(val)[:limit]
