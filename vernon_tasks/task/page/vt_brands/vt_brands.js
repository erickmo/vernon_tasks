/* IIFE wrapper: desk Page scripts are run via frappe.dom.eval as a <script>
   injected into GLOBAL scope. Top-level const/let here would leak globally
   and collide ("Identifier X has already been declared") when another VT
   page declaring the same name was visited first, or on a re-eval — the whole
   script then aborts and the page renders blank. Wrapping isolates every
   declaration to function scope. */
(function () {
/* vt_brands.js — desk page listing VT Brand records as cards.
   List-only: create/edit/delete all delegate to the native Frappe form.
   API: vernon_tasks.brand.api.portal_brands.list_brands */

const BRANDS_API = "vernon_tasks.brand.api.portal_brands.list_brands";
const BRAND_DOCTYPE = "VT Brand";

// Maximum description characters shown on a card before truncating.
const DESC_MAX = 80;

// Minutes per hour — used to format estimated time as "Xj Ym".
const MIN_PER_HOUR = 60;

/**
 * Format a minute total as a short human duration: "Xj Ym" / "Xj" / "Ym".
 * Local to this page — no shared JS minutes formatter exists yet; promote to a
 * public/js util when a second caller (e.g. vt-brand-detail) needs it.
 *
 * @param {number} total - Minutes (may be 0, null or undefined).
 * @returns {string}
 */
function fmt_minutes(total) {
    const mins = Math.max(0, Math.round(total || 0));
    if (!mins) return "0m";
    const hours = Math.floor(mins / MIN_PER_HOUR);
    const rem = mins % MIN_PER_HOUR;
    if (hours && rem) return `${hours}j ${rem}m`;
    if (hours) return `${hours}j`;
    return `${rem}m`;
}

/**
 * Build the per-brand stats footer: active sprint, remaining tasks, remaining
 * estimated time and an effort-weighted progress bar. All values come from the
 * list_brands API (computed brand-wide, Cancelled work excluded).
 *
 * @param {object} b - Brand data incl. stats fields.
 * @returns {string} HTML string (all dynamic text escaped).
 */
function brand_stats_html(b) {
    const pct = Math.max(0, Math.min(100, Number(b.progress_pct) || 0));
    const sprint_title = (b.active_sprint_title || "").trim();
    const extra = b.active_sprint_count > 1 ? ` +${b.active_sprint_count - 1}` : "";
    const sprint_label = sprint_title
        ? frappe.utils.escape_html(sprint_title) + frappe.utils.escape_html(extra)
        : "—";

    return `<div class="vt-brand-stats">
        <div class="vt-brand-sprint">
            <span class="vt-brand-stat-lbl">Sprint aktif</span>
            <span class="vt-brand-sprint-name">${sprint_label}</span>
        </div>
        <div class="vt-brand-stat-grid">
            <div class="vt-brand-stat">
                <span class="vt-brand-stat-num">${Number(b.remaining_tasks) || 0}</span>
                <span class="vt-brand-stat-lbl">Sisa task</span>
            </div>
            <div class="vt-brand-stat">
                <span class="vt-brand-stat-num">${fmt_minutes(b.remaining_minutes)}</span>
                <span class="vt-brand-stat-lbl">Sisa estimasi</span>
            </div>
        </div>
        <div class="vt-brand-progress">
            <div class="vh-bar"><span style="width:${pct}%"></span></div>
            <span class="vt-brand-pct">${pct}%</span>
        </div>
    </div>`;
}

frappe.pages["vt-brands"].on_page_load = function (wrapper) {
    // Gray background applied globally by vt_page_style.js.
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Brand"),
        single_column: true,
    });

    // "Buat Brand" only for roles that have create permission.
    // Use frappe.model.can_create (client-side perm helper backed by
    // frappe.boot.user.can_create); frappe.has_permission is server-only.
    if (frappe.model.can_create(BRAND_DOCTYPE)) {
        page.set_primary_action(__("Buat Brand"), () => frappe.new_doc(BRAND_DOCTYPE), "add");
    }

    page.add_button(__("Refresh"), () => render_brands(page), { icon: "refresh" });
    render_brands(page);
};

/**
 * Fetch all brands and paint card grid into the page body.
 *
 * @param {object} page - Frappe AppPage instance.
 */
function render_brands(page) {
    const container = $('<div class="vt-home"></div>');
    page.main.empty().append(container);
    frappe.call({ method: BRANDS_API }).then((r) => paint_brands(container, r.message || []));
}

/**
 * Render brand cards from API response into the container element.
 *
 * @param {jQuery} container - Wrapper element to paint into.
 * @param {Array}  brands    - Array of {id, brand_name, logo, description} objects.
 */
function paint_brands(container, brands) {
    const section = $('<div class="vh-section"></div>');
    container.append(section);

    if (!brands.length) {
        section.append('<div class="vh-empty">Belum ada brand.</div>');
        return;
    }

    // Sort A→Z by brand name (locale-aware, case-insensitive). Backend already
    // returns brand_name ASC; this guarantees order even if the source changes.
    const sorted = brands.slice().sort((a, b) =>
        (a.brand_name || "").localeCompare(b.brand_name || "", undefined, { sensitivity: "base" })
    );

    const row = $('<div class="vt-brands-grid"></div>');
    section.append(row);
    sorted.forEach((b) => row.append(brand_card(b)));
}

/**
 * Build a single brand card element.
 *
 * Logo is shown as an <img> when available (the controller auto-generates an
 * SVG avatar, so this is almost always set). Falls back to an initial badge
 * rendered in CSS so the card never shows a broken-image icon.
 *
 * @param {object} b - Brand data: {id, brand_name, logo, description}.
 * @returns {jQuery}
 */
function brand_card(b) {
    const name_safe = frappe.utils.escape_html(b.brand_name || "");
    const desc_raw  = (b.description || "").trim();
    const desc_safe = frappe.utils.escape_html(
        desc_raw.length > DESC_MAX ? desc_raw.slice(0, DESC_MAX) + "…" : desc_raw
    );

    const logo_html = b.logo
        ? `<img src="${frappe.utils.escape_html(b.logo)}"
               alt="${name_safe}"
               style="width:40px;height:40px;border-radius:8px;object-fit:cover;">`
        : `<span style="display:inline-flex;align-items:center;justify-content:center;
               width:40px;height:40px;border-radius:8px;background:#6366f1;
               color:#fff;font-weight:700;font-size:18px;">
               ${name_safe.slice(0, 1).toUpperCase() || "?"}
           </span>`;

    const card = $(`<div class="vh-card vt-brand-card" style="cursor:pointer;">
        <div class="vt-brand-head">
            ${logo_html}
            <span class="vt-brand-name">${name_safe}</span>
        </div>
        <div class="vh-item-meta vt-brand-desc">${desc_safe}</div>
        ${brand_stats_html(b)}
    </div>`);

    card.on("click", () => frappe.set_route("vt-brand-detail", b.id));
    return card;
}

})();
