/* IIFE wrapper: desk Page scripts are run via frappe.dom.eval as a <script>
   injected into GLOBAL scope. Top-level const/let here would leak globally
   and collide ("Identifier X has already been declared") when another VT
   page declaring the same name was visited first, or on a re-eval — the whole
   script then aborts and the page renders blank. Wrapping isolates every
   declaration to function scope. */
(function () {
/* vt_settings.js — desk page: friendly VT Settings hub for managers.
   Reads/writes via vernon_tasks.task.api.settings. Presentation only.
   Styling reuses global .vh-* classes from vt-home (no CSS added here). */

const GET_API = "vernon_tasks.task.api.settings.get_settings";
const SAVE_API = "vernon_tasks.task.api.settings.save_settings";

const BRANDING_FIELDS = [
    { key: "login_headline", label: "Judul Login" },
    { key: "login_subtext", label: "Subteks Login" },
];
const SCORING_FIELDS = [
    { key: "weight_multiplier", label: "Pengali Bobot" },
    { key: "early_bonus_rate", label: "Bonus Awal" },
    { key: "late_penalty_rate", label: "Penalti Terlambat" },
    { key: "revision_deduct_rate", label: "Potongan Revisi" },
    { key: "default_daily_target_hours", label: "Target Jam Harian" },
];

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

frappe.pages["vt-settings"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Pengaturan",
        single_column: true,
    });
    const state = { navbar: [], branding: {}, scoring: {} };
    page.add_button(__("Simpan"), () => save(page, state), { primary: true });
    page.add_button(__("Refresh"), () => load(page, state), { icon: "refresh" });
    load(page, state);
};

function load(page, state) {
    frappe.call(GET_API).then((r) => {
        const d = r.message || {};
        state.navbar = (d.navbar_items || []).map((x) => ({
            label: x.label, route: x.route, icon: x.icon, enabled: x.enabled ? 1 : 0,
            // Preserve the structural fields the editor doesn't expose, so a save
            // round-trips them instead of nulling the role-gated menu (which would
            // flatten the dropdown groups and leak Manager-only links to everyone).
            is_group: x.is_group ? 1 : 0,
            parent_group: x.parent_group || "",
            role_restriction: x.role_restriction || "",
        }));
        state.branding = d.branding || {};
        state.scoring = d.scoring || {};
        render(page, state);
    });
}

function render(page, state) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    c.append(navbar_section(page, state));
    c.append(fields_section("Branding Login", BRANDING_FIELDS, state.branding, "text"));
    c.append(fields_section("Scoring", SCORING_FIELDS, state.scoring, "number"));
}

function fields_section(title, fields, store, type) {
    const sec = $(`<div class="vh-section"><div class="vh-section-title">${esc(title)}</div></div>`);
    const card = $('<div class="vh-card"></div>');
    fields.forEach((f) => {
        const row = $(`<div class="vh-item"><span class="vh-lbl">${esc(f.label)}</span></div>`);
        const input = $(`<input type="${type}" class="form-control input-sm" style="max-width:280px;">`);
        input.val(store[f.key] == null ? "" : store[f.key]);
        input.on("input", () => { store[f.key] = input.val(); });
        row.append(input);
        card.append(row);
    });
    sec.append(card);
    return sec;
}

function navbar_section(page, state) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Navbar</div></div>');
    if (!state.navbar.length) {
        sec.append('<div class="vh-empty">Belum ada item navbar.</div>');
    }
    state.navbar.forEach((item, i) => sec.append(navbar_card(page, state, item, i)));
    const add = $(`<button class="btn btn-xs btn-default" style="margin-top:8px;">+ ${esc("Tambah Item")}</button>`);
    add.on("click", () => {
        state.navbar.push({
            label: "", route: "", icon: "", enabled: 1,
            is_group: 0, parent_group: "", role_restriction: "",
        });
        render(page, state);
    });
    sec.append(add);
    return sec;
}

function navbar_card(page, state, item, i) {
    const card = $('<div class="vh-card" style="margin-bottom:8px;"></div>');
    card.append(text_field("Label", item, "label"));
    card.append(text_field("Route", item, "route"));
    card.append(text_field("Ikon", item, "icon"));
    card.append(enabled_field(item));
    card.append(navbar_actions(page, state, i));
    return card;
}

function text_field(label, item, key) {
    const row = $(`<div class="vh-item"><span class="vh-lbl">${esc(label)}</span></div>`);
    const input = $('<input type="text" class="form-control input-sm" style="max-width:280px;">');
    input.val(item[key] || "");
    input.on("input", () => { item[key] = input.val(); });
    row.append(input);
    return row;
}

function enabled_field(item) {
    const row = $(`<div class="vh-item"><span class="vh-lbl">${esc("Aktif")}</span></div>`);
    const cb = $('<input type="checkbox">');
    cb.prop("checked", !!item.enabled);
    cb.on("change", () => { item.enabled = cb.prop("checked") ? 1 : 0; });
    row.append(cb);
    return row;
}

function navbar_actions(page, state, i) {
    const row = $('<div class="vh-item" style="gap:6px;"></div>');
    const up = $('<button class="btn btn-xs btn-default">↑</button>');
    const down = $('<button class="btn btn-xs btn-default">↓</button>');
    const del = $(`<button class="btn btn-xs btn-default">${esc("Hapus")}</button>`);
    up.on("click", () => move(page, state, i, -1));
    down.on("click", () => move(page, state, i, 1));
    del.on("click", () => { state.navbar.splice(i, 1); render(page, state); });
    row.append(up, down, del);
    return row;
}

function move(page, state, i, delta) {
    const j = i + delta;
    if (j < 0 || j >= state.navbar.length) return;
    const arr = state.navbar;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    render(page, state);
}

function save(page, state) {
    frappe.call({
        method: SAVE_API,
        args: {
            navbar_items: state.navbar,
            branding: state.branding,
            scoring: state.scoring,
        },
    }).then(() => {
        frappe.show_alert({ message: __("Tersimpan"), indicator: "green" });
        load(page, state);
    });
}

})();
