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
        if (frappe.router && frappe.router.on) frappe.router.on("change", vt_navbar_on_route);
        // The content column can change left offset on resize/sidebar toggle.
        $(window).on("resize.vt_navbar", () => vt_navbar_align(2));
        return;
    }
    if (tries > 0) setTimeout(() => vt_navbar_wait_for_desk(tries - 1), VT_NAV_POLL_MS);
}

/* On every route change: refresh active state, then re-align to the new
   page's content column (its left offset may differ per page). */
function vt_navbar_on_route() {
    vt_navbar_update_active();
    vt_navbar_align(VT_NAV_POLL_TRIES);
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
        vt_navbar_align(VT_NAV_POLL_TRIES);
        return;
    }

    const items = vt_navbar_items();
    const bar = $(`<div id="${VT_NAVBAR_ID}" class="vt-navbar2"></div>`);
    // Inner row holds the items; its left padding is set at runtime by
    // vt_navbar_align() to match the active page's content column, since the
    // sub-nav lives in the top bar (a different layout column than the body).
    const inner = $(`<div class="vt-navbar2-inner"></div>`);
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
    vt_navbar_align(VT_NAV_POLL_TRIES);
}

/* The currently visible desk page container. Frappe tracks it as
   cur_page.page; data-page-route is NOT route[0] for list/form pages
   (it's e.g. "List/VT Task"), so we use the tracked node instead of
   rebuilding the key. Fallback: first page-container that is actually
   rendered (hidden cached pages have offsetParent === null). */
function vt_navbar_active_page() {
    if (window.cur_page && window.cur_page.page) return window.cur_page.page;
    const pages = document.querySelectorAll(".page-container");
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].offsetParent !== null) return pages[i];
    }
    return null;
}

/* Resolve the active page's content container (where the page title and body
   sit) so navbar2 can align to it — works for desk pages, list and form
   views alike. */
function vt_navbar_content_container() {
    const scope = vt_navbar_active_page() || document;
    return scope.querySelector(".page-head .container") || scope.querySelector(".container.page-body");
}

/* Match the sub-nav row's left edge to the active page's content column so
   navbar2 lines up with the page title and body. The container can render a
   tick after a route change, so poll briefly until it exists. */
function vt_navbar_align(tries) {
    const inner = document.querySelector(`#${VT_NAVBAR_ID} .vt-navbar2-inner`);
    if (!inner) return;
    const ref = vt_navbar_content_container();
    if (ref) {
        const pad = parseFloat(window.getComputedStyle(ref).paddingLeft) || 0;
        const left = ref.getBoundingClientRect().left + pad;
        inner.style.paddingLeft = Math.max(0, left) + "px";
        return;
    }
    if (tries > 0) setTimeout(() => vt_navbar_align(tries - 1), VT_NAV_POLL_MS);
}

/* A route is "under" a nav item when it equals it or is a sub-path of it,
   so /app/my-work/123 still highlights the /app/my-work item. */
function vt_navbar_route_matches(route, path) {
    return !!route && (path === route || path.indexOf(route + "/") === 0);
}

function vt_navbar_update_active() {
    const path = window.location.pathname;
    const $bar = $(`#${VT_NAVBAR_ID}`);
    // Clear every active state first. Group triggers carry no data-route and are
    // only ever switched ON below (when a child matches), so without this reset a
    // group like "Saya" stays highlighted on every later route once one of its
    // children was visited. Resetting all .vt-nav-item (triggers included) plus
    // dropdown items makes the highlight reflect the current route only.
    $bar.find(".vt-nav-item, .vt-nav-dropdown-item").removeClass("active");

    // Standalone links
    $bar.find(".vt-nav-item:not(.vt-nav-group-trigger)").each(function () {
        $(this).toggleClass("active", vt_navbar_route_matches($(this).data("route"), path));
    });
    // Dropdown items → mark the item and bubble active up to its group trigger
    $bar.find(".vt-nav-dropdown-item").each(function () {
        if (!vt_navbar_route_matches($(this).data("route"), path)) return;
        $(this).addClass("active");
        $(this).closest(".vt-nav-group").find(".vt-nav-group-trigger").addClass("active");
    });
}
