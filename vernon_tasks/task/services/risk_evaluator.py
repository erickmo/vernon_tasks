import frappe
from frappe.utils import date_diff, getdate, today
from vernon_tasks.task.services.threshold import get_project_threshold
from vernon_tasks.task.services.forecast_service import get_forecast

_BLOCKED_STATUS = "Blocked"
_DONE_PHASE = "DONE"
_DEFAULT_WEEKLY_HOURS = 40


def _severity(ratio):
    if ratio >= 2.0:
        return "high"
    if ratio >= 1.0:
        return "med"
    return "low"


def _blocked_risks(project, threshold_days):
    rows = frappe.db.sql("""
        SELECT name, title, assigned_to, modified
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND kanban_status = %(blocked)s
          AND pdca_phase != %(done)s
    """, {"project": project, "blocked": _BLOCKED_STATUS, "done": _DONE_PHASE}, as_dict=True)

    risks = []
    today_d = getdate(today())
    for r in rows:
        days = date_diff(today_d, getdate(r["modified"]))
        if days > threshold_days:
            ratio = days / threshold_days
            risks.append({
                "type": "blocked",
                "severity": _severity(ratio),
                "target": r["name"],
                "detail": f"{r['title']} blocked {days}d (assignee: {r['assigned_to'] or 'unassigned'})",
                "days": int(days),
            })
    return risks


def _slip_risk(project, threshold_pct):
    project_doc = frappe.get_doc("VT Project", project)
    if not project_doc.end_date:
        return []
    forecast = get_forecast(project)
    if forecast.get("insufficient_data"):
        return []

    planned = getdate(project_doc.end_date)
    predicted = getdate(forecast["predicted_end"])
    total_days = max(1, date_diff(planned, getdate(project_doc.start_date)))
    slip_days = date_diff(predicted, planned)
    if slip_days <= 0:
        return []

    slip_pct = (slip_days / total_days) * 100
    if slip_pct < threshold_pct:
        return []

    ratio = slip_pct / threshold_pct
    return [{
        "type": "slip",
        "severity": _severity(ratio),
        "target": project,
        "detail": f"Predicted end {predicted} slips {int(slip_days)}d past planned {planned} ({slip_pct:.1f}%)",
        "days": int(slip_days),
    }]


def _overcap_risks(project, threshold_pct):
    rows = frappe.db.sql("""
        SELECT assigned_to,
               COALESCE(SUM(GREATEST(estimated_hours - actual_hours, 0)), 0) AS hrs
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND pdca_phase != %(done)s
          AND assigned_to IS NOT NULL
        GROUP BY assigned_to
    """, {"project": project, "done": _DONE_PHASE}, as_dict=True)

    project_doc = frappe.get_doc("VT Project", project)
    if project_doc.end_date:
        days_left = max(1, date_diff(getdate(project_doc.end_date), getdate(today())))
        available = (days_left / 7) * _DEFAULT_WEEKLY_HOURS
    else:
        available = 2 * _DEFAULT_WEEKLY_HOURS

    risks = []
    for r in rows:
        hrs = float(r["hrs"])
        if available <= 0:
            continue
        pct = (hrs / available) * 100
        if pct >= threshold_pct:
            ratio = pct / threshold_pct
            risks.append({
                "type": "overcap",
                "severity": _severity(ratio),
                "target": r["assigned_to"],
                "detail": f"{r['assigned_to']} has {hrs:.0f}h of {available:.0f}h available ({pct:.0f}%)",
                "days": 0,
            })
    return risks


def evaluate_risks(project):
    blocked_thr = int(get_project_threshold(project, "blocked_days"))
    slip_thr = float(get_project_threshold(project, "slip_pct"))
    cap_thr = float(get_project_threshold(project, "capacity_pct"))

    return [
        *_blocked_risks(project, blocked_thr),
        *_slip_risk(project, slip_thr),
        *_overcap_risks(project, cap_thr),
    ]
