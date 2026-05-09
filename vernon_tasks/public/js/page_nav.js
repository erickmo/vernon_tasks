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
        const icon_html = link.icon
            ? `<svg class="icon icon-sm" style="margin-right:4px;"><use href="#icon-${link.icon}"></use></svg>`
            : "";
        const btn = $(`<button class="btn btn-xs btn-default">${icon_html}${__(link.label)}</button>`);
        btn.on("click", function () {
            frappe.set_route(link.route);
        });
        nav.append(btn);
    });

    // Prepend to page.main so it appears above the page container
    page.main.prepend(nav);
};
