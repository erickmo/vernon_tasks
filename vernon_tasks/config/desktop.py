from frappe import _


def get_data():
    return [
        {
            "module_name": "Okr",
            "color": "#4a9eff",
            "icon": "octicon octicon-milestone",
            "label": _("OKR"),
        },
        {
            "module_name": "Project",
            "color": "#4aff91",
            "icon": "octicon octicon-briefcase",
            "label": _("Projects"),
        },
        {
            "module_name": "Task",
            "color": "#ffaa4a",
            "icon": "octicon octicon-tasklist",
            "label": _("Tasks"),
        },
        {
            "module_name": "Workforce",
            "color": "#aa4aff",
            "icon": "octicon octicon-organization",
            "label": _("Workforce"),
        },
        {
            "module_name": "Vt Settings",
            "color": "#888888",
            "icon": "octicon octicon-gear",
            "label": _("Settings"),
        },
    ]
