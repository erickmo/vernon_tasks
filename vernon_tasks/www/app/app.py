import os

import frappe

no_cache = 1
sitemap = 0


def get_context(context):
    """Serve the built PWA index.html for /app/* routes (SPA fallback).

    Gated by VT Settings.portal_enabled. When the flag is off, redirect
    visitors to the mobile entry point at /m/.
    """
    portal_enabled = frappe.db.get_single_value("VT Settings", "portal_enabled")
    if not portal_enabled:
        frappe.local.flags.redirect_location = "/m/"
        raise frappe.Redirect

    app_path = frappe.get_app_path("vernon_tasks", "www", "app", "index.html")
    if os.path.exists(app_path):
        with open(app_path, "r", encoding="utf-8") as f:
            context.spa_html = f.read()
    else:
        context.spa_html = (
            "<!doctype html><html><body><p>Portal not built. "
            "Run <code>cd pwa &amp;&amp; npm run build</code>.</p></body></html>"
        )
    context.no_breadcrumbs = True
    context.no_cache = 1
    return context
