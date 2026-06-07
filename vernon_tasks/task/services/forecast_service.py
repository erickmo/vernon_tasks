import math
import statistics
from frappe.utils import add_days, date_diff, getdate, today
from vernon_tasks.task.services import vt_item_tree as tree
from vernon_tasks.task.services.velocity_service import get_velocity_trend

_MIN_SPRINTS = 3
_DEFAULT_SPRINT_DAYS = 14
# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED"; the legacy VT Sprint.status "Closed" is now sprint_state.
_DONE_PHASE = "CLOSED"
_CLOSED_STATUS = "Closed"


def _remaining_hours(project: str) -> float:
    """Sum of remaining work (estimated − actual, per-row clamped ≥ 0) across a
    Project's not-yet-done Task nodes.

    Replaces the legacy `VT Task WHERE project=… AND pdca_phase!='DONE'` scan:
    Tasks are VT Item descendants of the Project node (spanning Sprints), so use
    nested-set descendants; the done phase 'DONE' is now 'CLOSED'.
    estimated_minutes/actual_minutes/pdca_phase keep their names.
    """
    tasks = tree.descendants(
        project,
        "Task",
        filters={"pdca_phase": ["!=", _DONE_PHASE]},
        fields=["estimated_minutes", "actual_minutes"],
    )
    return float(sum(max((t.estimated_minutes or 0) - (t.actual_minutes or 0), 0)
        for t in tasks))


def _median_sprint_length(project: str) -> int:
    """Median duration (end − start + 1 days) of a Project's closed Sprints.

    Replaces the legacy `VT Sprint WHERE project=… AND status='Closed'` scan:
    Sprints are VT Item children of the Project node (status→sprint_state).
    start_date/end_date keep their names. Falls back to the default length when
    there are no closed sprints.
    """
    sprints = tree.children(
        project,
        "Sprint",
        filters={"sprint_state": _CLOSED_STATUS},
        fields=["start_date", "end_date"],
    )
    if not sprints:
        return _DEFAULT_SPRINT_DAYS
    days = [date_diff(s.end_date, s.start_date) + 1 for s in sprints]
    return int(statistics.median(days))


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
