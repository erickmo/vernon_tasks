"""Runs scheduled VT Report Subscriptions. Called by Frappe scheduler hourly.

For each enabled subscription, checks the cron expression against the
last_run_at timestamp. If due, runs the report under the owner's roles,
emails a CSV attachment to all recipients, and updates last_run_at /
last_status on the doc.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Optional

import frappe
from croniter import croniter
from frappe.utils import format_datetime, now_datetime

from vernon_tasks.task.services.report_runner import run as run_report

_MAX_ROW_PREVIEW = 10
_MAX_ERROR_LEN = 140


def run_due_subscriptions() -> int:
    """Scheduler entry point. Returns number of subscriptions executed."""
    subs = frappe.get_all(
        "VT Report Subscription",
        filters={"enabled": 1},
        fields=[
            "name",
            "slug",
            "title",
            "cron",
            "format",
            "filters_json",
            "last_run_at",
            "owner",
        ],
    )
    now = now_datetime()
    executed = 0
    for sub in subs:
        if not _is_due(sub.cron, sub.last_run_at, now):
            continue
        try:
            roles = set(frappe.get_roles(sub.owner))
            filters = json.loads(sub.filters_json or "{}")
            payload = run_report(sub.slug, filters, roles)
            _send_email(sub, payload)
            frappe.db.set_value(
                "VT Report Subscription",
                sub.name,
                {"last_run_at": now, "last_status": "ok"},
            )
            executed += 1
        except Exception as exc:  # noqa: BLE001 — log per-sub failure
            frappe.db.set_value(
                "VT Report Subscription",
                sub.name,
                {
                    "last_run_at": now,
                    "last_status": f"error: {str(exc)[:_MAX_ERROR_LEN]}",
                },
            )
            frappe.log_error(
                message=str(exc), title=f"Report subscription {sub.name} failed"
            )
    return executed


def _is_due(
    cron: str, last_run_at: Optional[datetime], now: datetime
) -> bool:
    base = last_run_at or now.replace(year=2000)
    next_fire = croniter(cron, base).get_next(datetime)
    return next_fire <= now


def _send_email(sub, payload: dict) -> None:
    recipients = frappe.get_all(
        "VT Report Subscription Recipient",
        filters={"parent": sub.name},
        fields=["user"],
        pluck="user",
    )
    if not recipients:
        return
    body = _build_html_body(payload)
    attachment = _build_csv_attachment(payload)
    frappe.sendmail(
        recipients=recipients,
        subject=(
            f"[Vernon] {payload['title']} — "
            f"{format_datetime(now_datetime(), 'yyyy-MM-dd')}"
        ),
        message=body,
        attachments=[attachment],
        delayed=False,
    )


def _build_html_body(payload: dict) -> str:
    rows_preview = payload["rows"][:_MAX_ROW_PREVIEW]
    cols = payload["columns"]
    parts = [f"<h3>{frappe.utils.escape_html(payload['title'])}</h3>"]
    if payload.get("narrative"):
        parts.append("<ul>")
        for n in payload["narrative"]:
            parts.append(f"<li>{frappe.utils.escape_html(n)}</li>")
        parts.append("</ul>")
    parts.append(
        f"<hr/><p>Rows preview ({len(payload['rows'])} total):</p>"
    )
    parts.append("<table border='1' cellpadding='4' cellspacing='0'><tr>")
    parts += [f"<th>{frappe.utils.escape_html(c['label'])}</th>" for c in cols]
    parts.append("</tr>")
    for row in rows_preview:
        parts.append("<tr>")
        for c in cols:
            parts.append(
                f"<td>{frappe.utils.escape_html(str(row.get(c['key'], '')))}</td>"
            )
        parts.append("</tr>")
    parts.append("</table>")
    return "\n".join(parts)


def _build_csv_attachment(payload: dict) -> dict:
    buf = io.StringIO()
    writer = csv.writer(buf)
    cols = payload["columns"]
    writer.writerow([c["label"] for c in cols])
    for row in payload["rows"]:
        writer.writerow([row.get(c["key"], "") for c in cols])
    return {
        "fname": f"{payload['slug']}.csv",
        "fcontent": buf.getvalue().encode("utf-8"),
    }
