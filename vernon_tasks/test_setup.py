import frappe


def before_tests():
    _patch_notification_settings()
    _patch_notification_log_email()


def _patch_notification_log_email():
    from frappe.desk.doctype.notification_log import notification_log as nl_mod
    nl_mod.send_notification_email = lambda doc: None


def _patch_notification_settings():
    from frappe.desk.doctype.notification_settings import notification_settings as ns_mod
    from frappe.core.doctype.user import user as user_mod

    def patched(user):
        if frappe.db.exists("Notification Settings", user):
            return
        doc = frappe.new_doc("Notification Settings")
        doc.name = user
        doc.user = user
        doc.flags.ignore_links = True
        doc.insert(ignore_permissions=True)

    ns_mod.create_notification_settings = patched
    user_mod.create_notification_settings = patched
