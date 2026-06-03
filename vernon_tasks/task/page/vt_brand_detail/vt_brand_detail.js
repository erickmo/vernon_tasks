/* IIFE wrapper: desk Page scripts run via frappe.dom.eval as a <script> in
   GLOBAL scope. Top-level const/let would leak and collide on re-eval. Wrapping
   isolates every declaration to function scope. */
(function () {
/* vt_brand_detail.js — desk Page: per-brand OKR surface.
   Hero (brand logo/name/desc) + period sections (collapsible, newest first)
   listing Objectives and their Key Results with progress. Inline create/edit of
   Objective + Key Result via frappe.ui.Dialog — PDCA transitions and deletes stay
   on the native form (state machine + cascade guards live in the controllers).
   Route shape: ["vt-brand-detail", <brand_id>].
   APIs: vernon_tasks.brand.api.brand_okr.* + brand_okr_mutations.* */

const READ_API = "vernon_tasks.brand.api.brand_okr.get_brand_okr";
const CREATE_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.create_objective";
const UPDATE_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.update_objective";
const GET_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.get_objective";
const CREATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.create_key_result";
const UPDATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.update_key_result";
const GET_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.get_key_result";

const BRAND_DOCTYPE = "VT Brand";
const STATUS_OPTIONS = "Open\nOn Track\nAt Risk\nClosed";
const PERIOD_HINT = "Format: YYYY, YYYY-Hn, YYYY-Qn, atau YYYY-MM";
const STATUS_COLORS = {
    "Open": "#6b7280", "On Track": "#16a34a", "At Risk": "#f59e0b", "Closed": "#374151",
};

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
const pct = (n) => Math.min(Math.max(Number(n) || 0, 0), 100);

frappe.pages["vt-brand-detail"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Brand"), single_column: true });
    const brand_id = frappe.get_route()[1];
    if (!brand_id) {
        page.main.empty().append('<div class="vt-home"><div class="vh-empty">Brand tidak ditemukan.</div></div>');
        return;
    }
    page.add_button(__("Refresh"), () => load_page(page, brand_id), { icon: "refresh" });
    page.add_button(__("Edit Brand"), () => frappe.set_route("Form", BRAND_DOCTYPE, brand_id));
    load_page(page, brand_id);
};

/**
 * Fetch the brand OKR payload and paint it.
 * @param {object} page - Frappe AppPage instance.
 * @param {string} brand_id - VT Brand name.
 */
function load_page(page, brand_id) {
    frappe.call({ method: READ_API, args: { brand_id } }).then((r) => {
        const data = r.message;
        if (!data) {
            page.main.empty().append('<div class="vt-home"><div class="vh-empty">Brand tidak ditemukan.</div></div>');
            return;
        }
        render(page, brand_id, data);
    });
}

/**
 * Paint hero + period sections; wire the "+ Objective" primary action.
 * @param {object} page
 * @param {string} brand_id
 * @param {object} data - get_brand_okr response.
 */
function render(page, brand_id, data) {
    const root = $('<div class="vt-home vt-detail"></div>');
    page.main.empty().append(root);
    root.append(hero(data.brand));

    // Per-doctype affordance gating (Objective and Key Result are separate perms).
    const perms = {
        can_edit_objective: data.can_edit_objective,
        can_create_kr: data.can_create_kr,
        can_edit_kr: data.can_edit_kr,
    };

    page.clear_primary_action();
    if (data.can_create_objective) {
        page.set_primary_action(__("+ Objective"), () => objective_dialog(page, brand_id, null), "add");
    }

    if (!data.periods.length) {
        root.append('<div class="vh-section"><div class="vh-empty">Belum ada OKR untuk brand ini.</div></div>');
        return;
    }
    data.periods.forEach((p) => root.append(period_section(page, brand_id, p, perms)));
}

/**
 * Brand hero block (logo + name + description).
 * @param {object} brand - {brand_name, logo, description}.
 * @returns {jQuery}
 */
function hero(brand) {
    const name = esc(brand.brand_name);
    const logo = brand.logo
        ? `<img src="${esc(brand.logo)}" alt="${name}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;">`
        : `<span style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:10px;background:#6366f1;color:#fff;font-weight:700;font-size:22px;">${name.slice(0, 1).toUpperCase() || "?"}</span>`;
    const desc = (brand.description || "").trim();
    return $(`<div class="vh-section" style="display:flex;align-items:center;gap:14px;">
        ${logo}
        <div>
            <h2 style="margin:0;font-size:20px;">${name}</h2>
            ${desc ? `<div class="vh-item-meta">${esc(desc)}</div>` : ""}
        </div>
    </div>`);
}

/**
 * One collapsible period section. Auto-expanded when is_current.
 * @returns {jQuery}
 */
function period_section(page, brand_id, p, perms) {
    const open = !!p.is_current;
    const section = $(`<div class="vh-section vt-period">
        <div class="vt-period-head" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <span class="vt-caret">${open ? "▼" : "▶"}</span>
            <strong>${esc(p.period)}</strong>
            <span class="vh-item-meta">${p.objectives.length} objective</span>
            ${p.is_current ? '<span style="font-size:11px;padding:1px 6px;border-radius:8px;background:#dbeafe;color:#1d4ed8;">aktif</span>' : ""}
        </div>
        <div class="vt-period-body" style="${open ? "" : "display:none;"}margin-top:10px;"></div>
    </div>`);
    const body = section.find(".vt-period-body");
    p.objectives.forEach((o) => body.append(objective_card(page, brand_id, o, perms)));
    section.find(".vt-period-head").on("click", () => {
        const visible = body.is(":visible");
        body.toggle();
        section.find(".vt-caret").text(visible ? "▶" : "▼");
    });
    return section;
}

/**
 * Objective card: title + status + PDCA + aggregate progress, with its KR rows.
 * @returns {jQuery}
 */
function objective_card(page, brand_id, o, perms) {
    const color = STATUS_COLORS[o.status] || "#6b7280";
    const obj_edit = perms.can_edit_objective
        ? `<button class="btn btn-xs btn-default vt-obj-edit">${__("edit")}</button>` : "";
    const kr_add = perms.can_create_kr
        ? `<button class="btn btn-xs btn-default vt-kr-add">${__("+ KR")}</button>` : "";
    const card = $(`<div class="vh-card" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <strong style="font-size:14px;">${esc(o.title)}</strong>
            <span style="font-size:11px;padding:1px 6px;border-radius:8px;background:${color}1a;color:${color};">${esc(o.status || "")}</span>
            <span class="vh-item-meta">PDCA: ${esc(o.pdca_phase || "")}</span>
            <span class="vh-item-meta">${o.progress}%</span>
            <span style="margin-left:auto;display:flex;gap:6px;">${obj_edit}${kr_add}</span>
        </div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:8px;">
            <div style="height:100%;width:${pct(o.progress)}%;background:#6366f1;"></div>
        </div>
        <div class="vt-kr-list"></div>
    </div>`);
    const list = card.find(".vt-kr-list");
    if (!o.key_results.length) {
        list.append('<div class="vh-item-meta">Belum ada key result.</div>');
    } else {
        o.key_results.forEach((kr) => list.append(kr_row(page, brand_id, kr, perms)));
    }
    card.find(".vt-obj-edit").on("click", () => objective_dialog(page, brand_id, o.id));
    card.find(".vt-kr-add").on("click", () => kr_dialog(page, brand_id, o.id, null));
    return card;
}

/**
 * Single Key Result row: metric, current/target, progress bar.
 * @returns {jQuery}
 */
function kr_row(page, brand_id, kr, perms) {
    const unit = kr.unit ? " " + esc(kr.unit) : "";
    const edit = perms.can_edit_kr
        ? `<button class="btn btn-xs btn-default vt-kr-edit">${__("edit")}</button>` : "";
    const row = $(`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid #f1f1f1;">
        <span style="flex:1;">${esc(kr.metric)}</span>
        <span class="vh-item-meta">${kr.current}/${kr.target}${unit}</span>
        <div style="width:90px;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct(kr.progress_percent)}%;background:#16a34a;"></div>
        </div>
        <span class="vh-item-meta">${kr.progress_percent}%</span>
        ${edit}
    </div>`);
    row.find(".vt-kr-edit").on("click", () => kr_dialog(page, brand_id, null, kr.id));
    return row;
}

/**
 * Create/edit Objective dialog. objective_id null => create.
 * On a server validation error frappe shows the message and the dialog stays
 * open (we only hide on success), so the user can correct and retry.
 */
function objective_dialog(page, brand_id, objective_id) {
    const dialog = new frappe.ui.Dialog({
        title: objective_id ? __("Edit Objective") : __("Objective Baru"),
        fields: [
            { fieldname: "title", label: __("Judul"), fieldtype: "Data", reqd: 1 },
            { fieldname: "period", label: __("Periode"), fieldtype: "Data", reqd: 1, description: PERIOD_HINT },
            { fieldname: "objective_owner", label: __("Owner"), fieldtype: "Link", options: "User" },
            { fieldname: "status", label: __("Status"), fieldtype: "Select", options: STATUS_OPTIONS },
            { fieldname: "description", label: __("Deskripsi"), fieldtype: "Small Text" },
        ],
        primary_action_label: __("Simpan"),
        primary_action(values) {
            const method = objective_id ? UPDATE_OBJ_API : CREATE_OBJ_API;
            const args = objective_id ? { objective_id, values } : { brand_id, values };
            frappe.call({ method, args }).then((r) => {
                if (!r || r.exc) return;  // server threw — keep dialog open
                dialog.hide();
                load_page(page, brand_id);
            });
        },
    });
    if (objective_id) {
        frappe.call({ method: GET_OBJ_API, args: { objective_id } }).then((r) => {
            dialog.set_values(r.message || {});
            dialog.show();
        });
    } else {
        dialog.show();
    }
}

/**
 * Create/edit Key Result dialog. kr_id null => create under objective_id.
 */
function kr_dialog(page, brand_id, objective_id, kr_id) {
    const dialog = new frappe.ui.Dialog({
        title: kr_id ? __("Edit Key Result") : __("Key Result Baru"),
        fields: [
            { fieldname: "metric", label: __("Metric"), fieldtype: "Data", reqd: 1 },
            { fieldname: "target_value", label: __("Target"), fieldtype: "Float", reqd: 1 },
            { fieldname: "current_value", label: __("Current"), fieldtype: "Float", default: 0 },
            { fieldname: "unit", label: __("Unit"), fieldtype: "Data" },
            { fieldname: "confidence", label: __("Confidence (%)"), fieldtype: "Percent" },
        ],
        primary_action_label: __("Simpan"),
        primary_action(values) {
            const method = kr_id ? UPDATE_KR_API : CREATE_KR_API;
            const args = kr_id ? { kr_id, values } : { objective_id, values };
            frappe.call({ method, args }).then((r) => {
                if (!r || r.exc) return;  // server threw — keep dialog open
                dialog.hide();
                load_page(page, brand_id);
            });
        },
    });
    if (kr_id) {
        frappe.call({ method: GET_KR_API, args: { kr_id } }).then((r) => {
            dialog.set_values(r.message || {});
            dialog.show();
        });
    } else {
        dialog.show();
    }
}

})();
