import frappe
from frappe.utils import add_days, today
from vernon_tasks.task.services.velocity_service import get_velocity_trend

_CLOSED = "Closed"
_DONE_PHASE = "DONE"
_ONTIME_WINDOW_DAYS = 90
_OKR_WEIGHT = 0.5
_ONTIME_WEIGHT = 0.3
_VELOCITY_WEIGHT = 0.2


def _okr_pct(brand: str | None = None) -> float:
    extra = "AND o.brand = %(brand)s" if brand else ""
    row = frappe.db.sql(f"""
        SELECT COALESCE(AVG(kr_avg), 0) AS pct
        FROM (
            SELECT AVG(kr.progress_percent) AS kr_avg
            FROM `tabObjective` o
            LEFT JOIN `tabKey Result` kr ON kr.objective = o.name
            WHERE o.status != %(closed)s {extra}
            GROUP BY o.name
        ) sub
    """, {"closed": _CLOSED, "brand": brand}, as_dict=True)
    return float(row[0]["pct"])


def _ontime_pct(brand: str | None = None) -> float:
    extra = ""
    params = {
        "done": _DONE_PHASE,
        "cutoff": add_days(today(), -_ONTIME_WINDOW_DAYS),
    }
    if brand:
        extra = """
          AND project IN (
            SELECT name FROM `tabVT Project` WHERE brand = %(brand)s
          )
        """
        params["brand"] = brand
    row = frappe.db.sql(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN deadline IS NULL OR completion_date <= deadline THEN 1 ELSE 0 END) AS ontime
        FROM `tabVT Task`
        WHERE pdca_phase = %(done)s
          AND completion_date >= %(cutoff)s
          {extra}
    """, params, as_dict=True)
    total = int(row[0]["total"] or 0)
    if total == 0:
        return 0.0
    ontime = int(row[0]["ontime"] or 0)
    return round((ontime / total) * 100, 2)


def _velocity_health(brand: str | None = None) -> float:
    extra = "AND brand = %(brand)s" if brand else ""
    rows = frappe.db.sql(f"""
        SELECT name FROM `tabVT Project`
        WHERE status != %(closed)s {extra}
    """, {"closed": _CLOSED, "brand": brand}, as_dict=True)

    trends = []
    for r in rows:
        result = get_velocity_trend(r["name"], n=6)
        if len(result["velocity"]) >= 2:
            trends.append(result["trend_pct"])

    if not trends:
        return 50.0

    mean_trend = sum(trends) / len(trends)
    clamped = max(-50.0, min(50.0, mean_trend))
    return round(50.0 + clamped, 2)


def get_health_score(brand: str | None = None) -> dict:
    okr = _okr_pct(brand)
    ontime = _ontime_pct(brand)
    velocity = _velocity_health(brand)
    score = round(
        okr * _OKR_WEIGHT + ontime * _ONTIME_WEIGHT + velocity * _VELOCITY_WEIGHT,
        2,
    )
    return {
        "score": score,
        "brand": brand,
        "okr_pct": round(okr, 2),
        "ontime_pct": round(ontime, 2),
        "velocity_health": round(velocity, 2),
        "breakdown": {
            "okr_weight": _OKR_WEIGHT,
            "ontime_weight": _ONTIME_WEIGHT,
            "velocity_weight": _VELOCITY_WEIGHT,
        },
    }


def list_brand_health_scores() -> list[dict]:
    brands = frappe.get_all("VT Brand", fields=["name", "brand_name"], order_by="brand_name ASC")
    result = []
    for b in brands:
        snap = get_health_score(brand=b["name"])
        snap["brand_name"] = b["brand_name"]
        result.append(snap)
    return result
