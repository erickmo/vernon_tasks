import frappe

SLUG = "project-health"
TITLE = "Project Health Heatmap"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "project_name", "label": "Project", "type": "string"},
    {"key": "trend",        "label": "Trend",   "type": "string"},
    *[{"key": f"w{n}", "label": f"W-{n}", "type": "number"} for n in range(8, 0, -1)],
]


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql("""
            SELECT p.name AS project_id, p.title AS project_name,
                   p.health_score AS w0,
                   p.health_history_json
              FROM `tabVT Project` p
             WHERE p.status != 'Done'
        """, as_dict=True)
    except Exception:
        rows = []
    out = []
    for r in rows:
        history = frappe.parse_json(r.get("health_history_json") or "[]")
        weeks = history[-8:] if len(history) >= 8 else ([0] * (8 - len(history)) + history)
        row = {"project_id": r.project_id, "project_name": r.project_name}
        for i, score in enumerate(weeks):
            row[f"w{8 - i}"] = float(score or 0)
        row["trend"] = _trend_arrow(weeks)
        out.append(row)
    return {
        "viz": {"type": "heatmap", "x_keys": [f"w{n}" for n in range(8, 0, -1)]},
        "rows": out,
        "narrative": _narrative(out),
    }


def _trend_arrow(weeks: list) -> str:
    if len(weeks) < 2:
        return "-"
    delta = (weeks[-1] or 0) - (weeks[0] or 0)
    if abs(delta) < 2:
        return "->"
    return "up" if delta > 0 else "down"


def _narrative(rows: list) -> list:
    notes = []
    decliners = [r for r in rows if r["trend"] == "down"]
    for r in decliners[:3]:
        delta = (r.get("w1") or 0) - (r.get("w8") or 0)
        notes.append(f"{r['project_name']} health changed {round(delta, 1)}pts over 8w")
    if not notes:
        notes.append("No declining projects in the last 8 weeks.")
    return notes
