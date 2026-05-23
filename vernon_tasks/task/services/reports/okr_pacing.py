import frappe

SLUG = "okr-pacing"
TITLE = "OKR Progress vs Time-Elapsed"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "objective", "label": "Objective", "type": "string"},
    {"key": "kr",        "label": "Key Result", "type": "string"},
    {"key": "progress",  "label": "Progress %",  "type": "number"},
    {"key": "pace",      "label": "Pace %",       "type": "number"},
    {"key": "gap",       "label": "Gap (pp)",    "type": "number"},
]


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql(
            """
            SELECT o.name AS objective_id, o.title AS objective,
                   kr.name AS kr_id, kr.metric AS kr,
                   kr.target_value, kr.current_value,
                   o.period_start, o.period_end
              FROM `tabKey Result` kr
              JOIN `tabObjective` o ON o.name = kr.objective
            """,
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []
    from datetime import date
    today = date.today()
    out = []
    for r in rows:
        progress = (float(r.current_value or 0) / float(r.target_value)) if r.target_value else 0
        if r.period_start and r.period_end and r.period_end != r.period_start:
            elapsed = (today - r.period_start).days / (r.period_end - r.period_start).days
            pace = max(0.0, min(1.0, elapsed))
        else:
            pace = 0.0
        gap = progress - pace
        out.append({
            "objective_id": r.objective_id, "objective": r.objective,
            "kr_id": r.kr_id, "kr": r.kr,
            "progress": round(progress * 100, 1),
            "pace":     round(pace * 100, 1),
            "gap":      round(gap * 100, 1),
        })
    out.sort(key=lambda x: x["gap"])
    return {
        "viz": {"type": "bar", "x": "kr", "y": "gap", "color_negative": True},
        "rows": out,
        "narrative": [
            f"{out[0]['kr']} is {abs(out[0]['gap']):.1f}pp behind pace"
            if out and out[0]["gap"] < 0 else "All KRs are on or ahead of pace.",
        ],
    }
