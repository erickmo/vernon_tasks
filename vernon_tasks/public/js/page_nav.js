/**
 * vt_render_page_nav — renders a small nav bar at the top of a Frappe page.
 *
 * @param {Object} page  - the Frappe page object from frappe.ui.make_app_page()
 * @param {Array}  links - array of { label: string, route: string, icon: string }
 *                         route examples: "workspace/My Tasks", "my-work", "my-dashboard"
 */
window.vt_render_page_nav = function (page, links) {
    const nav = $('<div class="vt-page-nav"></div>').css({
        display: "flex",
        gap: "8px",
        alignItems: "center",
        padding: "8px 20px",
        background: "var(--subtle-bg)",
        borderBottom: "1px solid var(--border-color)",
        marginBottom: "4px",
        flexWrap: "wrap",
    });

    links.forEach(function (link) {
        const safe_icon = link.icon && /^[a-z0-9-]+$/.test(link.icon) ? link.icon : "";
        const icon_html = safe_icon
            ? `<svg class="icon icon-sm" style="margin-right:4px;"><use href="#icon-${safe_icon}"></use></svg>`
            : "";
        const safe_label = frappe.utils.escape_html(__(link.label));
        const btn = $(`<button class="btn btn-xs btn-default">${icon_html}${safe_label}</button>`);
        btn.on("click", function () {
            frappe.set_route(link.route);
        });
        nav.append(btn);
    });

    // Prepend to page.main so it appears above the page container
    page.main.prepend(nav);
};
