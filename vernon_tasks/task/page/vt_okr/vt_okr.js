/* IIFE wrapper: desk Page scripts are run via frappe.dom.eval as a <script>
   injected into GLOBAL scope. Top-level const/let here would leak globally
   and collide ("Identifier X has already been declared") when another VT
   page declaring the same name was visited first, or on a re-eval — the whole
   script then aborts and the page renders blank. Wrapping isolates every
   declaration to function scope. */
(function () {
/* vt_okr.js — OKR management page for Leaders and Managers.
   Shows accordion list of Objectives with embedded Key Results.
   Inline confidence/current_value updates via update_key_result API.
   Create/edit Objective routes to native Frappe form. */

const OKR_API_LIST   = "vernon_tasks.task.page.vt_okr.vt_okr.list_objectives";
const OKR_API_UPDATE = "vernon_tasks.task.page.vt_okr.vt_okr.update_key_result";
const OKR_DOCTYPE    = "Objective";

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

const STATUS_COLOR = {
    Open:   "var(--blue-500)",
    Closed: "var(--green-500)",
    Dropped:"var(--red-400)",
};

frappe.pages["vt-okr"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("OKR"),
        single_column: true,
    });

    const state = { period: "", brand: "" };

    const period_field = page.add_field({
        fieldname: "period",
        label: __("Periode"),
        fieldtype: "Data",
        description: __("contoh: 2026-Q2"),
        change: () => { state.period = period_field.get_value() || ""; render(); },
    });

    const brand_field = page.add_field({
        fieldname: "brand",
        label: __("Brand"),
        fieldtype: "Link",
        options: "VT Brand",
        change: () => { state.brand = brand_field.get_value() || ""; render(); },
    });

    page.set_primary_action(__("Buat Objective"), () => frappe.new_doc(OKR_DOCTYPE), "add");
    page.add_button(__("Refresh"), render, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px 0;"></div>').appendTo(page.main);

    function call_list() {
        const args = {};
        if (state.period) args.period = state.period;
        if (state.brand) args.brand = state.brand;
        return frappe.call({ method: OKR_API_LIST, args }).then((r) => r.message || []);
    }

    function progress_bar_html(pct, color, bar_class, pct_class) {
        const safe_pct = Math.min(100, Math.max(0, pct || 0));
        const bar_cls = bar_class || "";
        const pct_cls = pct_class || "";
        return `
            <div style="background:var(--border-color);border-radius:4px;height:6px;width:100%;margin-top:4px;">
                <div class="${bar_cls}" style="width:${safe_pct.toFixed(1)}%;height:6px;border-radius:4px;background:${color};"></div>
            </div>
            <span class="${pct_cls}" style="font-size:11px;color:var(--text-muted);">${safe_pct.toFixed(1)}%</span>
        `;
    }

    function build_kr_row(kr) {
        const row = $(`
            <div class="okr-kr-row" style="display:flex;align-items:flex-start;gap:12px;
                 padding:8px 12px;border-bottom:1px solid var(--border-color);font-size:13px;">
                <div style="flex:2;">
                    <div style="font-weight:500;">${esc(kr.metric)}</div>
                    ${progress_bar_html(kr.progress_percent, "var(--primary)", "okr-kr-bar", "okr-kr-pct")}
                </div>
                <div style="flex:1;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <input class="form-control form-control-sm okr-current-input"
                           type="number" step="any"
                           value="${esc(kr.current_value)}"
                           style="width:90px;"
                           title="${__('Current Value')}" />
                    <span style="color:var(--text-muted);font-size:12px;">/ ${esc(kr.target_value)} ${esc(kr.unit || "")}</span>
                    <button class="btn btn-xs btn-primary okr-save-btn">${__("Simpan")}</button>
                </div>
            </div>
        `);

        row.find(".okr-save-btn").on("click", function () {
            const new_val = parseFloat(row.find(".okr-current-input").val());
            if (isNaN(new_val)) return frappe.throw(__("Nilai harus angka"));
            frappe.call({
                method: OKR_API_UPDATE,
                args: { key_result: kr.name, current_value: new_val },
            }).then((r) => {
                const updated = r.message;
                kr.current_value = updated.current_value;
                kr.progress_percent = updated.progress_percent;
                row.find(".okr-current-input").val(updated.current_value);
                row.find(".okr-kr-bar").css("width", updated.progress_percent.toFixed(1) + "%");
                row.find(".okr-kr-pct").text(updated.progress_percent.toFixed(1) + "%");
                frappe.show_alert({ message: __("KR diperbarui"), indicator: "green" });
            }).catch(() => {
                frappe.show_alert({ message: __("Gagal memperbarui KR"), indicator: "red" });
            });
        });

        return row;
    }

    function build_objective_card(obj) {
        const color = STATUS_COLOR[obj.status] || "var(--text-muted)";
        const obj_name_safe = esc(obj.name);
        const card = $(`
            <div class="okr-card" style="border:1px solid var(--border-color);border-radius:8px;
                 margin-bottom:12px;overflow:hidden;">
                <div class="okr-header" style="display:flex;align-items:center;gap:12px;
                     padding:12px 16px;cursor:pointer;background:var(--subtle-bg);">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;">${esc(obj.title)}</div>
                        <div style="font-size:12px;color:var(--text-muted);">
                            ${esc(obj.period)} · ${esc(obj.brand || "—")} ·
                            <span style="color:${color};">${esc(obj.status)}</span> ·
                            ${obj.kr_count} KR
                        </div>
                        ${progress_bar_html(obj.avg_progress, color)}
                    </div>
                    <button class="btn btn-xs btn-default okr-edit-btn">${__("Edit")}</button>
                    <span class="okr-toggle" style="font-size:18px;color:var(--text-muted);">▾</span>
                </div>
                <div class="okr-body" style="display:none;"></div>
            </div>
        `);

        card.find(".okr-edit-btn").on("click", function (e) {
            e.stopPropagation();
            frappe.set_route("Form", OKR_DOCTYPE, obj.name);
        });

        const body = card.find(".okr-body");
        if (!obj.key_results.length) {
            body.append(`<div style="padding:12px;color:var(--text-muted);font-size:13px;">${__("Belum ada Key Result")}</div>`);
        } else {
            obj.key_results.forEach((kr) => body.append(build_kr_row(kr)));
        }

        card.find(".okr-header").on("click", function () {
            const open = body.is(":visible");
            body.toggle(!open);
            card.find(".okr-toggle").text(open ? "▾" : "▴");
        });

        return card;
    }

    function render() {
        container.empty();
        container.append(`<div class="vh-section-title" style="margin-bottom:16px;">${__("Daftar Objective")}</div>`);
        const spinner = $('<div class="vh-empty">Memuat...</div>').appendTo(container);

        call_list().then((objectives) => {
            spinner.remove();
            if (!objectives.length) {
                container.append(`<div class="vh-empty">${__("Belum ada Objective. Klik 'Buat Objective' untuk mulai.")}</div>`);
                return;
            }
            objectives.forEach((obj) => container.append(build_objective_card(obj)));
        });
    }

    render();
};

})();
