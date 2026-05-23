import frappe

SLUG = "project-health"
TITLE = "Project Health Heatmap"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "project_name", "label": "Project", "type": "string"},
    {"key": "trend",        "label": "Trend",   "type": "string"},
    *[{"key": f"w{n}", "label": f"W-{n}", "type": "number"} for n in range(8, 0, -1)],
]

# Fallback weight when no history present yet.
_STATUS_SCORE = {
    "On Track": 100.0,
    "Open": 75.0,
    "At Risk": 40.0,
    "Closed": 0.0,
}
_HISTORY_WEEKS = 8


def _trend_arrow(history: list[float]) -> str:
    if len(history) < 2:
        return "->"
    last, prev = float(history[-1] or 0), float(history[-2] or 0)
    if last > prev + 1:
        return "up"
    if last < prev - 1:
        return "down"
    return "->"


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql(
            """
            SELECT p.name AS project_id, p.title AS project_name, p.status,
                   p.health_score, p.health_history_json
              FROM `tabVT Project` p
             WHERE p.status != 'Closed'
            """,
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []

    out = []
    empty_history_count = 0
    for r in rows:
        history: list[float] = []
        if r.get("health_history_json"):
            try:
                parsed = frappe.parse_json(r.get("health_history_json")) or []
                if isinstance(parsed, list):
                    history = [float(x or 0) for x in parsed][-_HISTORY_WEEKS:]
            except (ValueError, TypeError):
                history = []

        if not history:
            empty_history_count += 1
            current = (
                float(r.health_score)
                if r.get("health_score") is not None
                else _STATUS_SCORE.get(r.get("status"), 50.0)
            )
            history = [current]

        # Right-align history: most recent → w1, oldest → w8
        row = {"project_id": r.project_id, "project_name": r.project_name}
        padded = ([0.0] * (_HISTORY_WEEKS - len(history))) + history
        for idx, n in enumerate(range(_HISTORY_WEEKS, 0, -1)):
            row[f"w{n}"] = round(float(padded[idx] or 0), 2)
        row["trend"] = _trend_arrow(history)
        out.append(row)

    narrative = []
    if empty_history_count:
        narrative.append(
            f"{empty_history_count} project(s) lack health history; showing current snapshot."
        )
    return {
        "viz": {"type": "heatmap", "x_keys": [f"w{n}" for n in range(8, 0, -1)]},
        "rows": out,
        "narrative": narrative,
    }
