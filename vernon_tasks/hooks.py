from . import __version__ as app_version
import frappe

_PWA_SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "push=(self), notifications=(self)",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; "
        "worker-src 'self';"
    ),
}


def add_pwa_security_headers(response):
    path = getattr(getattr(frappe, "local", None), "request", None)
    path = getattr(path, "path", "") if path else ""
    if path == "/m" or path.startswith("/m/"):
        for key, val in _PWA_SECURITY_HEADERS.items():
            response.headers.setdefault(key, val)
    return response


app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]

required_apps = []

doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": [
            "vernon_tasks.task.services.scheduling_engine.on_task_update",
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
        ],
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        "validate": "vernon_tasks.project.doctype.vt_project.vt_project.validate_team",
    },
    "VT Sprint": {
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}

scheduler_events = {
    "daily": [
        "vernon_tasks.task.services.scheduling_engine.generate_recurring_tasks",
        "vernon_tasks.task.services.point_calculator.check_overdue_tasks",
        "vernon_tasks.workforce.doctype.daily_summary.daily_summary.generate_daily_summaries",
        "vernon_tasks.task.api.telemetry.purge_old_telemetry",
    ],
    "hourly": [
        "vernon_tasks.task.services.scheduling_engine.check_deadline_notifications",
    ],
}

home_page = "m"

website_route_rules = [
    {"from_route": "/m/login", "to_route": "m"},
    {"from_route": "/m/onboarding", "to_route": "m"},
    {"from_route": "/m/work", "to_route": "m"},
    {"from_route": "/m/work/<path:id>", "to_route": "m"},
    {"from_route": "/m/dashboard", "to_route": "m"},
    {"from_route": "/m/analytics", "to_route": "m"},
    {"from_route": "/m/me", "to_route": "m"},
    {"from_route": "/m/me/notifications", "to_route": "m"},
    {"from_route": "/m/me/notifications/settings", "to_route": "m"},
    {"from_route": "/m/leader", "to_route": "m"},
]

after_request = ["vernon_tasks.hooks.add_pwa_security_headers"]

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["VT Manager", "VT Leader", "VT Member"]]]},
    {"dt": "Workspace", "filters": [["name", "in", ["My Tasks", "My Projects", "Overview"]]]},
]
