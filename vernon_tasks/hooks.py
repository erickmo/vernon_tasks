from . import __version__ as app_version

app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

app_include_js = [
    "/assets/vernon_tasks/js/page_nav.js",
    "/assets/vernon_tasks/js/vt_empty.js",
    "/assets/vernon_tasks/js/vt_navbar.js",
    "/assets/vernon_tasks/js/vt_project_redirect.js",
    "/assets/vernon_tasks/js/vt_page_style.js",
    "/assets/vernon_tasks/js/vt_focus_panel.js",
]
app_include_css = [
    "/assets/vernon_tasks/css/vt_home.css",
    "/assets/vernon_tasks/css/vt_board.css",
]
extend_bootinfo = "vernon_tasks.boot.extend_bootinfo"
on_session_creation = ["vernon_tasks.setup.roles.grant_default_role"]
after_install = ["vernon_tasks.setup_website.ensure_navbar_seeded"]
after_migrate = [
    "vernon_tasks.setup_website.ensure_navbar_seeded",
    "vernon_tasks.setup.onboarding_seed.ensure_onboarding_seeded",
]

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
        "on_update": [
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
        ],
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
        "vernon_tasks.task.services.report_subscription_runner.run_due_subscriptions",
    ],
}

website_redirects = [
    # Root -> desk. /app shows login if not authenticated, desk if logged in.
    # 302 (not 301) so browsers don't cache the redirect permanently.
    {"source": r"/$", "target": "/app", "redirect_http_status": 302},
    {"source": r"/index", "target": "/app", "redirect_http_status": 302},
]

before_tests = "vernon_tasks.test_setup.before_tests"

fixtures = [
    # Roles & Workspace
    {"dt": "Role", "filters": [["name", "in", ["VT Manager", "VT Leader", "VT Member"]]]},
    {"dt": "Workspace", "filters": [["name", "in", ["My Tasks", "My Projects", "Overview"]]]},
    {"dt": "Page", "filters": [["name", "=", "vt-home"]]},
    {"dt": "Page", "filters": [["name", "=", "vt-projects"]]},
    {"dt": "Page", "filters": [["name", "=", "vt-project-detail"]]},
    {"dt": "Page", "filters": [["name", "=", "vt-settings"]]},
    # Website brand & content
    {"dt": "Website Theme", "filters": [["name", "=", "Vernon Tasks Theme"]]},
    {"dt": "Website Slideshow", "filters": [["name", "=", "Vernon Hero"]]},
    # Home page route is "home" (Frappe auto-generates route from title when empty)
    {"dt": "Web Page", "filters": [["route", "in", ["home", "tentang", "kontak"]]]},
    # Frappe slugifies Web Form title: "Hubungi Kami" → "hubungi-kami"
    {"dt": "Web Form", "filters": [["name", "=", "hubungi-kami"]]},
    # Frappe v15: Website Route Meta name IS the route (no separate route column)
    {"dt": "Website Route Meta", "filters": [["name", "in", ["/", "/tentang", "/kontak"]]]},
    # Home page = login, hide footer signup
    {"dt": "Website Settings"},
]
