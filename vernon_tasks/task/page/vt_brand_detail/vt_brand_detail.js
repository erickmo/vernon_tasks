/* IIFE wrapper: desk Page scripts run via frappe.dom.eval as a <script> in
   GLOBAL scope. Top-level const/let would leak and collide on re-eval. Wrapping
   isolates every declaration to function scope. */
(function () {
/* vt_brand_detail.js — desk Page: per-brand OKR surface.
   Hero (brand logo/name/desc) + period sections (collapsible, newest first)
   listing Objectives and their Key Results with progress. Objective create uses
   Frappe native quick entry; Objective edit opens the native full form. Key Result
   create/edit stays inline via frappe.ui.Dialog. PDCA transitions and deletes stay
   on the native form (state machine + cascade guards live in the controllers).
   Route shape: ["vt-brand-detail", <brand_id>].
   APIs: vernon_tasks.brand.api.brand_okr.* + brand_okr_mutations.* (KR only) */

const READ_API = "vernon_tasks.brand.api.brand_okr.get_brand_okr";
const CREATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.create_key_result";
const UPDATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.update_key_result";
const GET_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.get_key_result";

const BRAND_DOCTYPE = "VT Brand";
const OBJECTIVE_DOCTYPE = "Objective";
// Objective create/edit run through native Frappe flows (quick entry / full form).
// The brand-scoped create prefills + locks this field so the new Objective always
// belongs to the brand whose page we're on.
const BRAND_FIELD = "brand";
const STATUS_COLORS = {
    "Open": "#6b7280", "On Track": "#16a34a", "At Risk": "#f59e0b", "Closed": "#374151",
};
// Status segment bar — render order + color, reusing STATUS_COLORS values.
const STATUS_ORDER = ["On Track", "At Risk", "Open", "Closed"];

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
const pct = (n) => Math.min(Math.max(Number(n) || 0, 0), 100);
// Compact number: integers as-is, otherwise ≤2 decimals with trailing zeros trimmed.
const fmt_num = (n) => {
    const x = Number(n) || 0;
    return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, "");
};

// Stashed on the page object so on_page_show can detect a brand change.
const CURRENT_BRAND_KEY = "__vt_brand_id";

// Desk Page lifecycle: on_page_load fires ONCE (page DOM created); on_page_show
// fires on EVERY navigation, including route-arg changes (.../Default ->
// .../SekolahPro) where the page DOM is reused. Reading the route arg only in
// on_page_load left the view stale until a full reload. Build static scaffold
// here; do the per-brand fetch in on_page_show keyed on the current route arg.
frappe.pages["vt-brand-detail"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Brand"), single_column: true });
    // Button callbacks re-read the route at click time so they stay correct
    // after navigating between brands without re-adding the buttons.
    page.add_button(__("Refresh"), () => load_page(page, frappe.get_route()[1]), { icon: "refresh" });
    page.add_button(__("Edit Brand"), () => frappe.set_route("Form", BRAND_DOCTYPE, frappe.get_route()[1]));
    wrapper.__vt_brand_page = page;
};

// Re-render when the brand in the route differs from the one already painted.
frappe.pages["vt-brand-detail"].on_page_show = function (wrapper) {
    const page = wrapper.__vt_brand_page;
    if (!page) return;
    const brand_id = frappe.get_route()[1];
    if (page[CURRENT_BRAND_KEY] === brand_id) return;  // same brand already shown
    page[CURRENT_BRAND_KEY] = brand_id;
    if (!brand_id) {
        page.clear_primary_action();
        page.main.empty().append('<div class="vt-home"><div class="vh-empty">Brand tidak ditemukan.</div></div>');
        return;
    }
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
 * Paint hero + stat strip + snapshot, then the two flow zones (Strategi /
 * Eksekusi); wire the "+ Objective" primary action.
 * @param {object} page
 * @param {string} brand_id
 * @param {object} data - get_brand_okr response.
 */
function render(page, brand_id, data) {
    const root = $('<div class="vt-home vt-detail"></div>');
    page.main.empty().append(root);
    root.append(hero(data.brand));
    root.append(stat_bar(data.summary));
    const snap = snapshot_card(data.summary);
    if (snap) root.append(snap);

    // Per-doctype affordance gating (Objective and Key Result are separate perms).
    const perms = {
        can_edit_objective: data.can_edit_objective,
        can_create_kr: data.can_create_kr,
        can_edit_kr: data.can_edit_kr,
    };
    page.clear_primary_action();
    if (data.can_create_objective) {
        page.set_primary_action(__("+ Objective"), () => objective_create(page, brand_id), "add");
    }

    // The page mirrors the domain flow: STRATEGI (OKR + KPI) and EKSEKUSI
    // (projects → sprints → tasks), stitched by the optional OKR↔Project bridge.
    root.append(strategy_zone(page, brand_id, data, perms));
    root.append(execution_zone(data.execution));
}

/**
 * Labeled zone divider (title + subtitle).
 * @param {string} title
 * @param {string} sub
 * @returns {string} HTML.
 */
function zone_label(title, sub) {
    return `<div class="vt-zone"><span class="vt-zone-title">${esc(title)}</span>
        <span class="vt-zone-sub">${esc(sub)}</span></div>`;
}

/**
 * STRATEGI zone: OKR-per-period sections + the brand-level KPI block.
 * @returns {jQuery}
 */
function strategy_zone(page, brand_id, data, perms) {
    const zone = $('<div class="vt-zone-wrap"></div>');
    zone.append(zone_label(__("Strategi"), __("Objective, Key Result & KPI")));
    if (!data.periods.length) {
        zone.append('<div class="vh-section"><div class="vh-empty">Belum ada OKR untuk brand ini.</div></div>');
    } else {
        zone.append('<div class="vt-group-label">OKR per Periode</div>');
        data.periods.forEach((p) => zone.append(period_section(page, brand_id, p, perms)));
    }
    if (data.can_read_kpi) zone.append(kpi_block(data.kpis));
    return zone;
}

/**
 * EKSEKUSI zone: project rollup + active sprint. Empty when the brand has no
 * projects (sprint→task drill lives on vt-project-detail).
 * @param {object} execution - get_brand_okr().execution.
 * @returns {jQuery}
 */
function execution_zone(execution) {
    if (!execution || !execution.project_count) return $();
    const zone = $('<div class="vt-zone-wrap"></div>');
    zone.append(zone_label(__("Eksekusi"), __("Proyek, sprint & sisa kerja")));
    zone.append(execution_section(execution));
    return zone;
}

/**
 * Brand hero block (logo + name + description).
 * @param {object} brand - {brand_name, logo, description}.
 * @returns {jQuery}
 */
function hero(brand) {
    const name = esc(brand.brand_name);
    const logo = brand.logo
        ? `<img class="vt-hero-logo" src="${esc(brand.logo)}" alt="${name}">`
        : `<span class="vt-hero-logo vt-hero-logo--ph">${name.slice(0, 1).toUpperCase() || "?"}</span>`;
    const desc = (brand.description || "").trim();
    return $(`<div class="vh-section vt-hero">
        ${logo}
        <div class="vt-hero-meta">
            <h2 class="vt-hero-name">${name}</h2>
            ${desc ? `<div class="vh-item-meta">${esc(desc)}</div>` : ""}
        </div>
    </div>`);
}

/**
 * Summary KPI strip: one mini stat-card per headline metric.
 * @param {object} s - get_brand_okr().summary.
 * @returns {jQuery}
 */
function stat_bar(s) {
    const cards = [
        kpi_card(s.objective_count, "Objective"),
        kpi_card(s.kr_count, "Key Result"),
        kpi_card(s.kpi_count || 0, "KPI"),
        kpi_card(pct(s.avg_progress) + "%", "Rata-rata"),
        kpi_card(s.at_risk_count, "At Risk", s.at_risk_count > 0 ? "vt-kpi--risk" : ""),
    ].join("");
    return $(`<div class="vh-section vt-kpi-strip">${cards}</div>`);
}

/**
 * One KPI mini-card (big serif number + uppercase label).
 * @param {(number|string)} value
 * @param {string} label
 * @param {string} [mod] - optional modifier class (e.g. vt-kpi--risk).
 * @returns {string} HTML.
 */
function kpi_card(value, label, mod) {
    return `<div class="vh-card vt-kpi ${mod || ""}">
        <span class="vt-kpi-num">${esc(String(value))}</span>
        <span class="vt-kpi-lbl">${esc(label)}</span>
    </div>`;
}

/**
 * Snapshot card: active-period progress + status distribution bar + legend.
 * @param {object} s - get_brand_okr().summary.
 * @returns {?jQuery} null when there is nothing to show.
 */
function snapshot_card(s) {
    const ap = s.active_period
        ? `<div class="vt-stat-active">Period aktif <b>${esc(s.active_period.period)}</b> · ${pct(s.active_period.progress)}%
             <div class="vt-bar"><div class="vt-bar-fill" style="width:${pct(s.active_period.progress)}%;"></div></div></div>`
        : "";
    const seg = status_segments(s.status_counts);
    if (!ap && !seg) return null;  // no active period and no objectives → skip card
    const dist = seg ? `<div class="vt-seg-wrap">${seg}${status_legend(s.status_counts)}</div>` : "";
    return $(`<div class="vh-section vt-snapshot">${ap}${dist}</div>`);
}

/**
 * Thin segmented bar showing objective status distribution.
 * @param {object} counts - {status: n}.
 * @returns {string} HTML (empty when no objectives).
 */
function status_segments(counts) {
    const total = STATUS_ORDER.reduce((acc, k) => acc + (counts[k] || 0), 0);
    if (!total) return "";
    const segs = STATUS_ORDER.filter((k) => counts[k]).map((k) => {
        const width = (counts[k] / total) * 100;
        return `<div title="${esc(k)}: ${counts[k]}" style="width:${width}%;background:${STATUS_COLORS[k]};"></div>`;
    }).join("");
    return `<div class="vt-status-seg">${segs}</div>`;
}

/**
 * Color-dot legend for the status segment bar.
 * @param {object} counts - {status: n}.
 * @returns {string} HTML (empty when no objectives).
 */
function status_legend(counts) {
    const items = STATUS_ORDER.filter((k) => counts[k]).map((k) =>
        `<span class="vt-seg-leg"><i style="background:${STATUS_COLORS[k]};"></i>${esc(k)} ${counts[k]}</span>`).join("");
    return items ? `<div class="vt-seg-legend">${items}</div>` : "";
}

/**
 * Brand-level KPI block (STRATEGI zone). Read-only — KPIs are managed on their
 * native forms; this only surfaces latest value + attainment + trend.
 * @param {Array<object>} kpis - get_brand_okr().kpis.
 * @returns {jQuery}
 */
function kpi_block(kpis) {
    const wrap = $('<div class="vh-section vt-kpi-section"></div>');
    wrap.append('<div class="vt-kpi-head"><strong>KPI</strong></div>');
    if (!kpis || !kpis.length) {
        wrap.append('<div class="vh-item-meta">Belum ada KPI untuk brand ini.</div>');
        return wrap;
    }
    const list = $('<div class="vt-kpi-rows"></div>');
    kpis.forEach((k) => list.append(kpi_metric_row(k)));
    wrap.append(list);
    return wrap;
}

/**
 * One KPI row: name · latest value (+ target bar when a target is set) · trend ·
 * frequency · linked objective chip ("Umum" when brand-level).
 * @param {object} k - one item from get_brand_okr().kpis.
 * @returns {jQuery}
 */
function kpi_metric_row(k) {
    const unit = k.unit ? " " + esc(k.unit) : "";
    const value = (k.value == null) ? "—" : esc(fmt_num(k.value)) + unit;
    // progress is null when target ≤ 0 (KPI tracked without a target) → no bar.
    const has_target = k.progress != null;
    const target = has_target ? `<span class="vh-item-meta">/ ${esc(fmt_num(k.target))}${unit}</span>` : "";
    const bar = has_target
        ? `<div class="vt-kpi-bar"><div class="vt-kpi-bar-fill" style="width:${pct(k.progress)}%;"></div></div>
           <span class="vh-item-meta">${Math.round(k.progress)}%</span>`
        : "";
    const obj = k.objective_title
        ? `<span class="vt-obj-chip">${esc(k.objective_title)}</span>`
        : '<span class="vt-obj-chip vt-obj-chip--none">Umum</span>';
    return $(`<div class="vt-kpi-row">
        <span class="vt-kpi-name">${esc(k.title)}</span>
        <span class="vt-kpi-val">${value}</span>
        ${target}
        ${trend_icon(k.trend)}
        ${bar}
        <span class="vt-kpi-freq">${esc(k.frequency || "")}</span>
        ${obj}
    </div>`);
}

/**
 * Trend arrow vs the previous entry. "none" (no/one entry) renders nothing.
 * @param {string} trend - up | down | flat | none.
 * @returns {string} HTML.
 */
function trend_icon(trend) {
    const map = { up: ["▲", "vt-trend--up"], down: ["▼", "vt-trend--down"], flat: ["–", "vt-trend--flat"] };
    const t = map[trend];
    return t ? `<span class="vt-trend ${t[1]}" title="Tren vs entry sebelumnya">${t[0]}</span>` : "";
}

/**
 * Linked-project chips for an objective (the OKR↔Project bridge). Each chip
 * routes to the project detail page on click.
 * @param {Array<object>} projects - objective.projects.
 * @returns {jQuery}
 */
function project_chips(projects) {
    const wrap = $('<div class="vt-proj-bridge"><span class="vt-proj-bridge-lbl">Proyek tertaut</span></div>');
    if (!projects || !projects.length) {
        wrap.append('<span class="vh-item-meta">belum ada proyek tertaut</span>');
        return wrap;
    }
    projects.forEach((p) => {
        const chip = $(`<span class="vt-proj-chip" data-id="${esc(p.id)}">${esc(p.title)} · ${pct(p.progress)}%</span>`);
        chip.on("click", () => frappe.set_route("vt-project-detail", p.id));
        wrap.append(chip);
    });
    return wrap;
}

/**
 * Collapsible execution section: active sprint + remaining work + project list.
 * @param {object} e - get_brand_okr().execution.
 * @returns {jQuery}
 */
function execution_section(e) {
    const sprint = e.active_sprint_title
        ? `Sprint aktif: <b>${esc(e.active_sprint_title)}</b>${e.active_sprint_count > 1 ? ` (+${e.active_sprint_count - 1})` : ""}`
        : "Tidak ada sprint aktif";
    const projects = e.projects.map((p) => {
        // Objective chip shows which OKR this project serves (the bridge); blank
        // → "tanpa objective".
        const obj = p.objective_title
            ? `<span class="vt-obj-chip">${esc(p.objective_title)}</span>`
            : '<span class="vt-obj-chip vt-obj-chip--none">tanpa objective</span>';
        return `<div class="vt-exec-proj" data-id="${esc(p.id)}">
            <span>${esc(p.name)}</span>
            ${obj}
            <span class="vh-item-meta">${pct(p.progress)}%</span>
        </div>`;
    }).join("");
    const section = $(`<div class="vh-section vt-period vt-exec">
        <div class="vt-period-head" style="cursor:pointer;">
            <span class="vt-caret">▼</span>
            <strong>Eksekusi</strong>
            <span class="vh-item-meta">${e.project_count} proyek</span>
        </div>
        <div class="vt-period-body" style="margin-top:10px;">
            <div class="vt-exec-meta">${sprint} · Sisa: ${e.remaining_tasks} tugas / ${e.remaining_minutes}m · Progress ${pct(e.progress_pct)}%</div>
            <div class="vt-bar"><div class="vt-bar-fill vt-bar-fill--exec" style="width:${pct(e.progress_pct)}%;"></div></div>
            <div class="vt-exec-list">${projects}</div>
        </div>
    </div>`);
    const body = section.find(".vt-period-body");
    section.find(".vt-period-head").on("click", () => {
        const visible = body.is(":visible");
        body.toggle();
        section.find(".vt-caret").text(visible ? "▶" : "▼");
    });
    section.find(".vt-exec-proj").on("click", function () {
        frappe.set_route("vt-project-detail", $(this).data("id"));
    });
    return section;
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
            <span class="vh-item-meta">${p.objectives.length} objective · ${pct(p.progress)}%</span>
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
            ${owner_chip(o)}
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
    card.append(project_chips(o.projects));  // OKR↔Project bridge
    card.find(".vt-obj-edit").on("click", () => frappe.set_route("Form", OBJECTIVE_DOCTYPE, o.id));
    card.find(".vt-kr-add").on("click", () => kr_dialog(page, brand_id, o.id, null));
    return card;
}

/**
 * Owner chip: avatar (image or initial circle) + name. Empty when no owner.
 * @param {object} o - objective with owner_name / owner_image.
 * @returns {string} HTML.
 */
function owner_chip(o) {
    if (!o.owner_name) return "";
    const name = esc(o.owner_name);
    const avatar = o.owner_image
        ? `<img src="${esc(o.owner_image)}" alt="${name}">`
        : `<span class="vt-owner-initial">${name.slice(0, 1).toUpperCase()}</span>`;
    return `<span class="vt-owner-chip">${avatar}${name}</span>`;
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
        ${kr.confidence ? `<span class="vt-kr-conf" title="Confidence">c:${pct(kr.confidence)}%</span>` : ""}
        ${edit}
    </div>`);
    row.find(".vt-kr-edit").on("click", () => kr_dialog(page, brand_id, null, kr.id));
    return row;
}

/**
 * Create an Objective via Frappe native quick entry, scoped to this brand.
 *
 * Quick entry surfaces the doctype's reqd + allow_in_quick_entry fields (title,
 * brand, period, objective_owner, status, description) and saves through
 * frappe.client.save, so the Objective controller validates exactly as on the
 * full form — no app-specific create endpoint needed. brand is prefilled + locked
 * read-only (page is brand-scoped); owner is prefilled to the current user.
 * after_insert re-renders the page in place instead of redirecting to the new doc.
 * Editing an Objective opens the native full form (see the .vt-obj-edit handler).
 *
 * @param {object} page - the desk Page (for re-render via load_page).
 * @param {string} brand_id - VT Brand this Objective must belong to.
 */
function objective_create(page, brand_id) {
    frappe.ui.form.make_quick_entry(
        OBJECTIVE_DOCTYPE,
        () => load_page(page, brand_id),  // after_insert: stay on page, re-render
        (dialog) => {
            // Lock brand to this page's brand — the value still reaches the insert
            // because quick entry reads read-only fields via dialog.get_values(true).
            dialog.set_value(BRAND_FIELD, brand_id);
            dialog.set_df_property(BRAND_FIELD, "read_only", 1);
        },
        { [BRAND_FIELD]: brand_id, objective_owner: frappe.session.user },
    );
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
