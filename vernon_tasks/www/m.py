import os
import frappe

no_cache = 1
sitemap = 0


def get_context(context):
    """Serve the built PWA index.html for /m/* routes (SPA fallback)."""
    app_path = frappe.get_app_path("vernon_tasks", "www", "m", "index.html")
    if os.path.exists(app_path):
        with open(app_path, "r", encoding="utf-8") as f:
            context.spa_html = f.read()
    else:
        context.spa_html = (
            "<!doctype html><html><body><p>PWA not built. "
            "Run <code>cd pwa &amp;&amp; npm run build</code>.</p></body></html>"
        )
    context.no_breadcrumbs = True
    return context
