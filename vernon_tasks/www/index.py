import frappe

no_cache = 1


def get_context(context):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = "/m"
