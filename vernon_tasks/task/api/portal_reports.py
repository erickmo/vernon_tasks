"""Portal Reports API — list, run, export, schedule.

Wraps the per-slug runners in `vernon_tasks.task.services.report_runner`
with auth, rate limiting, and serialization helpers.
"""
from __future__ import annotations

import csv
import io
import json

import frappe
from frappe.utils import now_datetime

from vernon_tasks.task.api.security import max_str, rate_limit, require_login
from vernon_tasks.task.services.report_runner import list_for_role, run

# --- Limits / constants ---
_SLUG_MAX_LEN = 64
_FILTERS_MAX_LEN = 4096
_EXPORT_RL_PER_MIN = 10
_ALLOWED_FORMATS = ("csv", "pdf")


@frappe.whitelist()
def list_reports() -> list[dict]:
    require_login()
    roles = set(frappe.get_roles())
    return list_for_role(roles)


@frappe.whitelist()
def run_report(slug: str, filters: str = "{}") -> dict:
    require_login()
    slug = max_str(slug, _SLUG_MAX_LEN)
    filters_raw = max_str(filters or "{}", _FILTERS_MAX_LEN)
    try:
        parsed = json.loads(filters_raw or "{}")
    except json.JSONDecodeError:
        frappe.throw("filters must be valid JSON", frappe.ValidationError)
        return {}  # unreachable
    if not isinstance(parsed, dict):
        frappe.throw("filters must be a JSON object", frappe.ValidationError)
    roles = set(frappe.get_roles())
    return run(slug, parsed, roles)


@frappe.whitelist()
def export(slug: str, filters: str = "{}", format: str = "csv"):
    require_login()
    rate_limit(f"report-export:{slug}", _EXPORT_RL_PER_MIN)
    slug = max_str(slug, _SLUG_MAX_LEN)
    if format not in _ALLOWED_FORMATS:
        frappe.throw("format must be csv or pdf", frappe.ValidationError)
    payload = run_report(slug=slug, filters=filters)
    if format == "csv":
        return _csv_response(payload)
    return _pdf_response(payload)


@frappe.whitelist()
def create_subscription(
    slug: str,
    title: str,
    cron: str,
    format: str,
    filters: str = "{}",
    recipients: list | str | None = None,
) -> dict:
    require_login()
    if not (frappe.has_role("Vernon Leader") or frappe.has_role("System Manager")):
        frappe.throw("Only Vernon Leader or System Manager can schedule", frappe.PermissionError)
    if format not in _ALLOWED_FORMATS:
        frappe.throw("format must be csv or pdf", frappe.ValidationError)
    if isinstance(recipients, str):
        try:
            recipients = json.loads(recipients)
        except json.JSONDecodeError:
            frappe.throw("recipients must be a JSON list", frappe.ValidationError)
    if not recipients or not isinstance(recipients, list):
        frappe.throw("At least one recipient is required", frappe.ValidationError)
    doc = frappe.get_doc({
        "doctype": "VT Report Subscription",
        "slug": max_str(slug, _SLUG_MAX_LEN),
        "title": max_str(title, 140),
        "cron": max_str(cron, 64),
        "format": format,
        "filters_json": max_str(filters or "{}", _FILTERS_MAX_LEN),
        "enabled": 1,
        "recipients": [{"user": str(u)} for u in recipients],
    }).insert()
    return {"name": doc.name}


# --- Serialization helpers (also used by scheduler) ---

def _csv_response(payload: dict):
    buf = io.StringIO()
    writer = csv.writer(buf)
    cols = payload["columns"]
    writer.writerow([c["label"] for c in cols])
    for r in payload["rows"]:
        writer.writerow([r.get(c["key"], "") for c in cols])
    frappe.local.response["type"] = "binary"
    frappe.local.response["filename"] = (
        f"{payload['slug']}-{now_datetime().strftime('%Y%m%d-%H%M')}.csv"
    )
    frappe.local.response["filecontent"] = buf.getvalue().encode("utf-8")


def _pdf_response(payload: dict):
    html = frappe.render_template(
        "templates/reports/generic_report.html", {"payload": payload}
    )
    from frappe.utils.pdf import get_pdf
    pdf_bytes = get_pdf(html)
    frappe.local.response["type"] = "binary"
    frappe.local.response["filename"] = (
        f"{payload['slug']}-{now_datetime().strftime('%Y%m%d-%H%M')}.pdf"
    )
    frappe.local.response["filecontent"] = pdf_bytes
