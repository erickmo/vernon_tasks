import math
import statistics
import frappe
from frappe.utils import add_days, getdate, today
from vernon_tasks.task.services.velocity_service import get_velocity_trend

_MIN_SPRINTS = 3
_DEFAULT_SPRINT_DAYS = 14


def _remaining_hours(project: str) -> float:
    row = frappe.db.sql("""
        SELECT COALESCE(SUM(GREATEST(estimated_minutes - actual_minutes, 0)), 0) AS hrs
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND pdca_phase != 'DONE'
    """, {"project": project}, as_dict=True)
    return float(row[0]["hrs"])


def _median_sprint_length(project: str) -> int:
    rows = frappe.db.sql("""
        SELECT DATEDIFF(end_date, start_date) + 1 AS days
        FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = 'Closed'
    """, {"project": project}, as_dict=True)
    if not rows:
        return _DEFAULT_SPRINT_DAYS
    return int(statistics.median([int(r["days"]) for r in rows]))


def _bucket_mean(values, pick):
    if not values:
        return 0.0
    sorted_v = sorted(values)
    size = max(1, len(sorted_v) // 3)
    bucket = sorted_v[:size] if pick == "worst" else sorted_v[-size:]
    return sum(bucket) / len(bucket)


def get_forecast(project: str) -> dict:
    trend = get_velocity_trend(project, n=6)
    velocities = trend["velocity"]

    if len(velocities) < _MIN_SPRINTS:
        return {
            "insufficient_data": True,
            "sprints_needed": _MIN_SPRINTS - len(velocities),
        }

    avg = trend["avg"]
    if avg <= 0:
        return {"insufficient_data": True, "sprints_needed": 0, "reason": "zero velocity"}

    remaining = _remaining_hours(project)
    sprint_days = _median_sprint_length(project)

    sprints_used = math.ceil(remaining / avg) if remaining > 0 else 0
    predicted_end = add_days(today(), sprints_used * sprint_days)

    min_v = _bucket_mean(velocities, "worst")
    max_v = _bucket_mean(velocities, "best")
    p_min = add_days(today(), math.ceil(remaining / min_v) * sprint_days) if min_v > 0 else predicted_end
    p_max = add_days(today(), math.ceil(remaining / max_v) * sprint_days) if max_v > 0 else predicted_end

    if len(velocities) >= 2:
        stdev = statistics.pstdev(velocities)
        confidence = max(0.0, min(1.0, 1 - (stdev / avg)))
    else:
        confidence = 0.0

    return {
        "insufficient_data": False,
        "predicted_end": str(getdate(predicted_end)),
        "p_min": str(getdate(p_min)),
        "p_max": str(getdate(p_max)),
        "confidence": round(float(confidence), 3),
        "remaining_hours": round(remaining, 2),
        "avg_velocity": round(float(avg), 2),
        "sprints_used": int(sprints_used),
    }
