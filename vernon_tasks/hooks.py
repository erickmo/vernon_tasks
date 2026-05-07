from . import __version__ as app_version

app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

required_apps = []

# Filled in later plans as modules are built
doc_events = {}
scheduler_events = {
    "daily": [
        "vernon_tasks.task.services.scheduling_engine.generate_recurring_tasks",
        "vernon_tasks.task.services.scheduling_engine.check_deadline_notifications",
    ],
}

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["VT Manager", "VT Leader", "VT Member"]]]},
]
