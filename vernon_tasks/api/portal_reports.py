import frappe
from vernon_tasks.task.api.security import clamp_int

# ── Lazy service imports (called inside functions only) ──────────────────────
# Import at function call time to avoid circular imports and keep module load fast.
# Each _<name> alias is consistent with the pattern in analytics.py.

def _get_health():
    from vernon_tasks.task.services.health_score_service import get_health_score
    return get_health_score

def _get_okr():
    from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup
    return get_okr_rollup

def _get_list_kpis():
    from vernon_tasks.task.services.kpi_trend_service import list_kpis
    return list_kpis

def _get_kpi_trend():
    from vernon_tasks.task.services.kpi_trend_service import get_kpi_trend
    return get_kpi_trend

def _get_velocity_trend():
    from vernon_tasks.task.services.velocity_service import get_velocity_trend
    return get_velocity_trend

def _get_forecast():
    from vernon_tasks.task.services.forecast_service import get_forecast
    return get_forecast

def _get_evaluate_risks():
    from vernon_tasks.task.services.risk_evaluator import evaluate_risks
    return evaluate_risks

def _get_leaderboard():
    from vernon_tasks.task.services.leaderboard_service import get_leaderboard
    return get_leaderboard


# Module-level aliases used directly in tests via patch targets
def _health(*a, **kw):
    return _get_health()(*a, **kw)

def _okr(*a, **kw):
    return _get_okr()(*a, **kw)

def _list_kpis(*a, **kw):
    return _get_list_kpis()(*a, **kw)

def _kpi_trend(*a, **kw):
    return _get_kpi_trend()(*a, **kw)

def _vel_trend(*a, **kw):
    return _get_velocity_trend()(*a, **kw)

def _forecast(*a, **kw):
    return _get_forecast()(*a, **kw)

def _evaluate_risks(*a, **kw):
    return _get_evaluate_risks()(*a, **kw)

def _lb(*a, **kw):
    return _get_leaderboard()(*a, **kw)


# ── Permission constants ─────────────────────────────────────────────────────
_MANAGER_ROLES = ("VT Manager", "System Manager")
_LEADER_ROLES  = ("VT Leader", "VT Manager", "System Manager")
_CACHE_TTL_SEC = 300
_MAX_PROJECTS  = 50


# ── Guards ───────────────────────────────────────────────────────────────────
def _check_flag():
    enabled = frappe.db.get_single_value("VT Settings", "portal_reports_enabled")
    if not int(enabled or 0):
        frappe.throw("Portal Reports is not enabled", frappe.PermissionError)


def _require_leader():
    if not set(frappe.get_roles()) & set(_LEADER_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _require_manager():
    if not set(frappe.get_roles()) & set(_MANAGER_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _role_bucket():
    """Returns 'manager' or 'leader' for use in cache keys."""
    roles = set(frappe.get_roles())
    if roles & set(_MANAGER_ROLES):
        return "manager"
    return "leader"


# ── Cache helper ─────────────────────────────────────────────────────────────
def _cache(key, fn):
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return cached
    val = fn()
    frappe.cache().set_value(key, val, expires_in_sec=_CACHE_TTL_SEC)
    return val


# ── Project scoping ──────────────────────────────────────────────────────────
def _visible_projects():
    """
    Returns list of dicts with keys 'name' and 'project_title'.
    Manager → all projects (up to _MAX_PROJECTS).
    Leader → only projects where assigned_to == current user.
    """
    bucket = _role_bucket()
    filters = {}
    if bucket == "leader":
        filters["assigned_to"] = frappe.session.user
    rows = frappe.get_list(
        "VT Project",
        filters=filters,
        fields=["name", "project_title"],
        limit=_MAX_PROJECTS,
        order_by="creation asc",
    )
    if len(rows) == _MAX_PROJECTS:
        frappe.log_error("portal_reports: fan-out capped at 50 projects for user "
                         + frappe.session.user, "PortalReports")
    return rows


# ── OKR tab endpoints (Manager only) ─────────────────────────────────────────
@frappe.whitelist()
def get_portal_health_score():
    _check_flag()
    _require_manager()
    key = "pr:health:manager"
    return _cache(key, lambda: _health())


@frappe.whitelist()
def get_portal_okr_rollup(period=None):
    _check_flag()
    _require_manager()
    period_key = period or "current"
    key = f"pr:okr:{period_key}:manager"
    return _cache(key, lambda: _okr(period))


@frappe.whitelist()
def get_portal_kpi_list():
    _check_flag()
    _require_manager()
    key = "pr:kpis:manager"
    return _cache(key, lambda: _list_kpis())


@frappe.whitelist()
def get_portal_kpi_trend(kpi_definition, periods=12):
    _check_flag()
    _require_manager()
    periods = clamp_int(periods, 1, 24, "periods")
    key = f"pr:kpi_trend:{kpi_definition}:{periods}:manager"
    return _cache(key, lambda: _kpi_trend(kpi_definition, periods))


# ── Cache invalidation (called from hooks.py) ────────────────────────────────
def invalidate_okr_cache(doc, method=None):
    """Clears health score + OKR rollup cache on KPI Snapshot or OKR Period update."""
    frappe.cache().delete_value("pr:health:manager")
    # Clear all OKR period variants — pattern match not available; delete known suffixes.
    for suffix in ("current", "manager"):
        frappe.cache().delete_value(f"pr:okr:{suffix}:manager")
    frappe.cache().delete_value("pr:kpis:manager")


# ── Sprints tab endpoints (Manager + Leader) ─────────────────────────────────
def _compute_trend(velocities: list) -> str:
    """'up' if last > first, 'down' if last < first, 'flat' otherwise."""
    if len(velocities) < 2:
        return "flat"
    if velocities[-1] > velocities[0]:
        return "up"
    if velocities[-1] < velocities[0]:
        return "down"
    return "flat"


@frappe.whitelist()
def get_portal_velocity_comparison(n=6):
    _check_flag()
    _require_leader()
    n = clamp_int(n, 1, 24, "n")
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:vel:{bucket}:{n}:{user}"

    def _build():
        projects = _visible_projects()
        result_projects = []
        for p in projects:
            sprints = _vel_trend(p["name"], n)
            velocities = [s.get("velocity", 0.0) for s in sprints]
            avg = round(sum(velocities) / len(velocities), 1) if velocities else 0.0
            result_projects.append({
                "project": p["name"],
                "project_title": p.get("project_title", p["name"]),
                "sprints": sprints,
                "avg_velocity": avg,
                "trend": _compute_trend(velocities),
            })
        return {"n": n, "projects": result_projects}

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_forecasts():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:forecasts:{bucket}:{user}"

    def _build():
        projects = _visible_projects()
        forecasts = []
        for p in projects:
            fc = _forecast(p["name"])
            if fc:
                fc.setdefault("project", p["name"])
                fc.setdefault("project_title", p.get("project_title", p["name"]))
            forecasts.append(fc)
        return {"forecasts": [f for f in forecasts if f]}

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_risks():
    _check_flag()
    _require_leader()
    # No caching — risks can change with every task move.
    projects = _visible_projects()
    risks = []
    for p in projects:
        risk_data = _evaluate_risks(p["name"])
        if isinstance(risk_data, dict):
            risk_data.setdefault("project", p["name"])
            risk_data.setdefault("project_title", p.get("project_title", p["name"]))
            risks.append(risk_data)
    return {"risks": risks}


# ── Workload helper ──────────────────────────────────────────────────────────
def _build_workload_rows(rows, visible_projects, project_names):
    """
    Enrich each user row with the list of projects they have open tasks in.
    Single grouped query replaces the previous N+1 per-project SELECT.
    """
    proj_rows = frappe.db.sql(
        """
        SELECT project, assigned_to
        FROM `tabVT Task`
        WHERE project IN %(projects)s AND assigned_to IS NOT NULL
        GROUP BY project, assigned_to
        """,
        {"projects": project_names},
        as_dict=True,
    )
    user_projects: dict = {}
    for pr in proj_rows:
        user_projects.setdefault(pr.assigned_to, []).append(pr.project)

    members = []
    for r in rows:
        r["projects"] = user_projects.get(r["user"], [])
        members.append(r)
    return members


# ── Team tab endpoints (Manager + Leader) ────────────────────────────────────
@frappe.whitelist()
def get_portal_leaderboard(period="this_month", limit=20):
    _check_flag()
    _require_leader()
    limit = clamp_int(limit, 1, 100, "limit")
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:leaderboard:{period}:{limit}:{bucket}:{user}"

    def _build():
        raw = _lb(period, limit)
        if bucket == "manager":
            return raw
        # Leader: filter rows to members whose projects overlap with visible projects
        visible_names = {p["name"] for p in _visible_projects()}
        if not visible_names:
            return {**(raw if isinstance(raw, dict) else {"rows": []}), "rows": []}
        # Get users who are assigned to visible projects
        member_users = set(frappe.db.sql(
            """SELECT DISTINCT assigned_to FROM `tabVT Task`
               WHERE project IN %(projects)s AND assigned_to IS NOT NULL""",
            {"projects": tuple(visible_names)},
            as_list=True,
        ) or [])
        member_users_flat = {row[0] for row in member_users}
        if isinstance(raw, dict):
            rows = [r for r in raw.get("rows", []) if r.get("user") in member_users_flat]
            return {**raw, "rows": rows}
        return raw

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_workload():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:workload:{bucket}:{user}"

    def _build():
        from frappe.utils import today as frappe_today
        visible = _visible_projects()
        if not visible:
            return {"as_of": frappe_today(), "members": []}
        project_names = tuple(p["name"] for p in visible)

        rows = frappe.db.sql(
            """
            SELECT
                t.assigned_to AS `user`,
                MAX(u.full_name) AS full_name,
                COUNT(*) AS open_tasks,
                COALESCE(SUM(t.estimated_hours), 0) AS open_hours,
                SUM(CASE WHEN t.deadline < %(today)s THEN 1 ELSE 0 END) AS overdue_tasks,
                COALESCE(SUM(CASE WHEN t.deadline < %(today)s
                               THEN t.estimated_hours ELSE 0 END), 0) AS overdue_hours
            FROM `tabVT Task` t
            LEFT JOIN `tabUser` u ON u.name = t.assigned_to
            WHERE t.project IN %(projects)s
              AND t.kanban_status NOT IN ('Done', 'Blocked')
              AND t.assigned_to IS NOT NULL
            GROUP BY t.assigned_to
            ORDER BY open_tasks DESC
            """,
            {"projects": project_names, "today": frappe_today()},
            as_dict=True,
        )

        members = _build_workload_rows(rows, visible, project_names)
        return {"as_of": frappe_today(), "members": members}

    return _cache(key, _build)


def _build_overdue_rows(visible_projects):
    """Query and assemble by_member + by_project overdue breakdowns."""
    from frappe.utils import today as frappe_today
    project_names = tuple(p["name"] for p in visible_projects)
    today_str = frappe_today()

    by_member = frappe.db.sql(
        """
        SELECT
            t.assigned_to AS `user`,
            MAX(u.full_name) AS full_name,
            COUNT(*) AS overdue_count,
            COALESCE(SUM(t.estimated_hours), 0) AS overdue_hours,
            DATEDIFF(%(today)s, MIN(t.deadline)) AS oldest_overdue_days
        FROM `tabVT Task` t
        LEFT JOIN `tabUser` u ON u.name = t.assigned_to
        WHERE t.project IN %(projects)s
          AND t.deadline < %(today)s
          AND t.kanban_status NOT IN ('Done', 'Blocked')
          AND t.assigned_to IS NOT NULL
        GROUP BY t.assigned_to
        ORDER BY overdue_count DESC
        """,
        {"projects": project_names, "today": today_str},
        as_dict=True,
    )

    proj_title_map = {p["name"]: p.get("project_title", p["name"]) for p in visible_projects}
    by_project = frappe.db.sql(
        """
        SELECT
            t.project,
            COUNT(*) AS overdue_count,
            COALESCE(SUM(t.estimated_hours), 0) AS overdue_hours
        FROM `tabVT Task` t
        WHERE t.project IN %(projects)s
          AND t.deadline < %(today)s
          AND t.kanban_status NOT IN ('Done', 'Blocked')
        GROUP BY t.project
        ORDER BY overdue_count DESC
        """,
        {"projects": project_names, "today": today_str},
        as_dict=True,
    )
    for row in by_project:
        row["project_title"] = proj_title_map.get(row["project"], row["project"])

    total = sum(r.get("overdue_count", 0) for r in by_member)
    return today_str, total, by_member, by_project


@frappe.whitelist()
def get_portal_overdue():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:overdue:{bucket}:{user}"

    def _build():
        from frappe.utils import today as frappe_today
        visible = _visible_projects()
        if not visible:
            return {
                "as_of": frappe_today(),
                "total_overdue": 0,
                "by_member": [],
                "by_project": [],
            }
        today_str, total, by_member, by_project = _build_overdue_rows(visible)
        return {
            "as_of": today_str,
            "total_overdue": total,
            "by_member": by_member,
            "by_project": by_project,
        }

    return _cache(key, _build)


# ── Mobile Reports endpoints (Leader/Manager only) ───────────────────────────
def _check_mobile_flag():
    """Throws unless VT Settings.mobile_reports_enabled = 1."""
    enabled = frappe.db.get_single_value("VT Settings", "mobile_reports_enabled")
    if not int(enabled or 0):
        frappe.throw("Mobile Reports is not enabled", frappe.PermissionError)


@frappe.whitelist()
def list_managed_projects():
    """Projects the current user manages, with per-project KPI snippet.

    Returns: {"projects": [{name, project_title, status, avg_velocity,
                            risk_count, member_count}, ...]}
    Permission: Leader+. Cached 5 min per user.
    """
    _check_mobile_flag()
    _require_leader()
    user = frappe.session.user
    bucket = _role_bucket()
    key = f"pr:mobile:managed:{bucket}:{user}"

    def _build():
        projects = _visible_projects()
        out = []
        for p in projects:
            sprints = _vel_trend(p["name"], 6)
            vels = [s.get("velocity", 0.0) for s in sprints]
            avg = round(sum(vels) / len(vels), 1) if vels else 0.0
            risk_data = _evaluate_risks(p["name"]) or {}
            risk_count = len(risk_data.get("risks", []) or [])
            members = frappe.get_all(
                "Project Team Member",
                filters={"parent": p["name"]},
                pluck="user",
            )
            out.append({
                "name": p["name"],
                "project_title": p.get("project_title", p["name"]),
                "status": p.get("status", "Active"),
                "avg_velocity": avg,
                "risk_count": risk_count,
                "member_count": len(members),
            })
        return {"projects": out}

    return _cache(key, _build)


# ── Per-project mobile endpoints (Leader+; managed-only) ─────────────────────
def _require_owns_project(project: str):
    """Throws unless current user has project in _visible_projects()."""
    if not any(p["name"] == project for p in _visible_projects()):
        frappe.throw("Not authorized for this project", frappe.PermissionError)


@frappe.whitelist()
def get_mobile_project_velocity(project: str, n: int = 6):
    """Velocity trend for a single managed project."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    n = clamp_int(n, 1, 24, "n")
    user = frappe.session.user
    key = f"pr:mobile:vel:{project}:{n}:{user}"

    def _build():
        sprints = _vel_trend(project, n)
        vels = [s.get("velocity", 0.0) for s in sprints]
        avg = round(sum(vels) / len(vels), 1) if vels else 0.0
        return {
            "project": project,
            "sprints": sprints,
            "avg_velocity": avg,
            "trend": _compute_trend(vels),
        }

    return _cache(key, _build)


@frappe.whitelist()
def get_mobile_project_forecast(project: str):
    """Forecast for a single managed project."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    user = frappe.session.user
    key = f"pr:mobile:forecast:{project}:{user}"
    return _cache(key, lambda: _forecast(project) or {})


@frappe.whitelist()
def get_mobile_project_risks(project: str):
    """Risks for a single managed project. Not cached (changes per task move)."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    return _evaluate_risks(project) or {"risks": []}


@frappe.whitelist()
def get_mobile_project_okr(project: str, period=None):
    """OKR rollup for a single managed project.

    Note: underlying okr_rollup_service.get_okr_rollup does not accept a
    project filter, so the rollup is global. The project arg is retained for
    permission scoping and future per-project rollup support.
    """
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    period_key = period or "current"
    user = frappe.session.user
    key = f"pr:mobile:okr:{project}:{period_key}:{user}"
    rollup = _cache(key, lambda: _okr(period))
    if isinstance(rollup, list):
        return {"rows": rollup}
    return rollup
