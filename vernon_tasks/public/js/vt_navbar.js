/* vt_navbar.js — global "navbar2" rendered on every desk page.
   Reads frappe.boot.vt_navbar_items (injected by extend_bootinfo);
   falls back to an inline default. Presentation only. */

const VT_NAVBAR_ID = "vt-navbar2";
const VT_NAV_DEFAULT = [
    { label: "Home", route: "/app/vt-home", icon: "home" },
    { label: "Project", route: "/app/vt-projects", icon: "folder-normal" },
];
const VT_NAV_POLL_TRIES = 25;
const VT_NAV_POLL_MS = 200;

$(document).ready(function () {
    vt_navbar_wait_for_desk(VT_NAV_POLL_TRIES);
});

function vt_navbar_wait_for_desk(tries) {
    if ($(".navbar").length) {
        vt_navbar_render();
        if (frappe.router && frappe.router.on) frappe.router.on("change", vt_navbar_update_active);
        return;
    }
    if (tries > 0) setTimeout(() => vt_navbar_wait_for_desk(tries - 1), VT_NAV_POLL_MS);
}

function vt_navbar_items() {
    return (frappe.boot && frappe.boot.vt_navbar_items) || VT_NAV_DEFAULT;
}

function vt_navbar_render() {
    if (document.getElementById(VT_NAVBAR_ID)) { vt_navbar_update_active(); return; }
    const bar = $(`<div id="${VT_NAVBAR_ID}" class="vt-navbar2"></div>`);
    vt_navbar_items().forEach((it) => {
        const route = frappe.utils.escape_html(it.route || "");
        const link = $(`<a class="vt-nav-item" data-route="${route}">${frappe.utils.escape_html(it.label || "")}</a>`);
        link.on("click", (e) => { e.preventDefault(); frappe.set_route(it.route); });
        bar.append(link);
    });
    $(".navbar").first().after(bar);
    vt_navbar_update_active();
}

function vt_navbar_update_active() {
    const path = window.location.pathname;
    $(`#${VT_NAVBAR_ID} .vt-nav-item`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
    });
}
