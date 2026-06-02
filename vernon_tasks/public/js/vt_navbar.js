/* vt_navbar.js — global "navbar2" rendered on every desk page.
   Reads frappe.boot.vt_navbar_items (injected by extend_bootinfo).
   Items with is_group=1 render as dropdown triggers; their children
   (items with parent_group == group.label) render inside a dropdown panel.
   Role filtering already applied server-side — no client check needed. */

const VT_NAVBAR_ID = "vt-navbar2";
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
    return (frappe.boot && frappe.boot.vt_navbar_items) || [];
}

/* Build a flat link element. */
function _build_link(it) {
    const route = frappe.utils.escape_html(it.route || "");
    const label = frappe.utils.escape_html(it.label || "");
    const el = $(`<a class="vt-nav-item" data-route="${route}">${label}</a>`);
    el.on("click", function (e) {
        e.preventDefault();
        frappe.set_route(it.route);
        $(".vt-nav-dropdown.open").removeClass("open");
    });
    return el;
}

/* Build a dropdown group element with its child links. */
function _build_dropdown(group_item, children) {
    const label = frappe.utils.escape_html(group_item.label || "");
    const wrapper = $(`<div class="vt-nav-group" data-group="${label}"></div>`);
    const trigger = $(`<a class="vt-nav-item vt-nav-group-trigger">${label} <span class="vt-nav-caret">▾</span></a>`);
    const panel = $(`<div class="vt-nav-dropdown"></div>`);

    children.forEach((child) => {
        const child_route = frappe.utils.escape_html(child.route || "");
        const child_label = frappe.utils.escape_html(child.label || "");
        const child_el = $(`<a class="vt-nav-dropdown-item" data-route="${child_route}">${child_label}</a>`);
        child_el.on("click", function (e) {
            e.preventDefault();
            panel.removeClass("open");
            frappe.set_route(child.route);
        });
        panel.append(child_el);
    });

    trigger.on("click", function (e) {
        e.stopPropagation();
        const is_open = panel.hasClass("open");
        $(".vt-nav-dropdown.open").removeClass("open");
        if (!is_open) panel.addClass("open");
    });

    wrapper.append(trigger, panel);
    return wrapper;
}

function vt_navbar_render() {
    if (document.getElementById(VT_NAVBAR_ID)) {
        vt_navbar_update_active();
        return;
    }

    const items = vt_navbar_items();
    const bar = $(`<div id="${VT_NAVBAR_ID}" class="vt-navbar2"></div>`);
    // Inner .container mirrors the primary navbar's .container so the VT
    // sub-nav content aligns to the same width and gutters as the main navbar.
    const inner = $(`<div class="container"></div>`);
    bar.append(inner);

    const children = items.filter((it) => it.parent_group);

    items.forEach((it) => {
        if (it.parent_group) return; // rendered inside dropdown
        if (it.is_group) {
            const kids = children.filter((c) => c.parent_group === it.label);
            if (kids.length === 0) return;
            inner.append(_build_dropdown(it, kids));
        } else {
            inner.append(_build_link(it));
        }
    });

    $(".navbar").first().after(bar);

    // Close dropdowns on outside click
    $(document).on("click.vt_navbar", function () {
        $(".vt-nav-dropdown.open").removeClass("open");
    });

    vt_navbar_update_active();
}

function vt_navbar_update_active() {
    const path = window.location.pathname;
    // Standalone links
    $(`#${VT_NAVBAR_ID} .vt-nav-item:not(.vt-nav-group-trigger)`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
    });
    // Dropdown items + their group trigger
    $(`#${VT_NAVBAR_ID} .vt-nav-dropdown-item`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
        if (active) {
            $(this).closest(".vt-nav-group").find(".vt-nav-group-trigger").addClass("active");
        }
    });
}
