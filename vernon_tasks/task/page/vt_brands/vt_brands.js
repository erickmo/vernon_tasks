/* vt_brands.js — desk page listing VT Brand records as cards.
   List-only: create/edit/delete all delegate to the native Frappe form.
   API: vernon_tasks.brand.api.portal_brands.list_brands */

const BRANDS_API = "vernon_tasks.brand.api.portal_brands.list_brands";
const BRAND_DOCTYPE = "VT Brand";

// Maximum description characters shown on a card before truncating.
const DESC_MAX = 80;

frappe.pages["vt-brands"].on_page_load = function (wrapper) {
    // Gray background applied globally by vt_page_style.js.
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Brand"),
        single_column: true,
    });

    // "Buat Brand" only for roles that have create permission.
    if (frappe.has_permission(BRAND_DOCTYPE, "create")) {
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

    const row = $('<div class="vh-row"></div>');
    section.append(row);
    brands.forEach((b) => row.append(brand_card(b)));
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

    const card = $(`<div class="vh-card" style="flex:1 1 220px;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            ${logo_html}
            <strong style="font-size:14px;">${name_safe}</strong>
        </div>
        ${desc_safe ? `<div class="vh-item-meta">${desc_safe}</div>` : ""}
    </div>`);

    card.on("click", () => frappe.set_route("Form", BRAND_DOCTYPE, b.id));
    return card;
}
