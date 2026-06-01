/* vt_page_style.js — gray page background for all desk pages.
   Loaded globally via app_include_js (a static, build-hashed asset, so it is
   always fresh — unlike per-page scripts served through getpage). On every
   route change it paints the active page-container gray, keeps page-head white,
   and makes inner Frappe wrappers transparent so the gray shows through.
   Styles are applied inline (proven to take effect) rather than via a
   stylesheet class, so it does not depend on CSS load order/specificity. */

const VT_PAGE_BG = "#f4f5f7";
const VT_GRAY_POLL_MS = 50;
const VT_GRAY_MAX_TRIES = 20;

function vt_apply_gray_bg() {
    const route = frappe.get_route();
    if (!route || !route[0]) return;
    // The page-container may render a tick after the route change, so poll
    // briefly until it exists before styling it.
    let tries = 0;
    const timer = setInterval(function () {
        const $pc = $(`.page-container[data-page-route="${route[0]}"]`);
        if ($pc.length) {
            $pc.css("background-color", VT_PAGE_BG);
            $pc.find(".page-head").css("background-color", "#fff");
            $pc.find(".page-body, .layout-main-section")
                .css("background-color", "transparent");
            clearInterval(timer);
        } else if (++tries >= VT_GRAY_MAX_TRIES) {
            clearInterval(timer);
        }
    }, VT_GRAY_POLL_MS);
}

frappe.router.on("change", vt_apply_gray_bg);
$(document).ready(vt_apply_gray_bg);
