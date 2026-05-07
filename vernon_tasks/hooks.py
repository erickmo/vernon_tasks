from . import __version__ as app_version

app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

required_apps = []

doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": "vernon_tasks.task.services.scheduling_engine.on_task_update",
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        "validate": "vernon_tasks.project.doctype.vt_project.vt_project.validate_team",
    },
}

scheduler_events = {
    "daily": [
        "vernon_tasks.task.services.scheduling_engine.generate_recurring_tasks",
        "vernon_tasks.task.services.point_calculator.check_overdue_tasks",
        "vernon_tasks.workforce.doctype.daily_summary.daily_summary.generate_daily_summaries",
    ],
    "hourly": [
        "vernon_tasks.task.services.scheduling_engine.check_deadline_notifications",
    ],
}

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["VT Manager", "VT Leader", "VT Member"]]]},
]
