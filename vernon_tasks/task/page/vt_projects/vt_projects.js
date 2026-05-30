/* vt_projects.js — desk page listing projects as cards.
   Reuses vernon_tasks.task.api.dashboard.my_projects. Presentation only. */

const PROJ_API = "vernon_tasks.task.api.dashboard.my_projects";
const PROJECT_DOCTYPE = "VT Project";
const PROJECT_STATUS_OPTIONS = "Open\nOn Track\nAt Risk\nClosed";
const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };

frappe.pages["vt-projects"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Proyek",
        single_column: true,
    });
    page.set_primary_action(__("Buat Proyek"), () => open_create_dialog(page), "add");
    page.add_button(__("Refresh"), () => render_projects(page), { icon: "refresh" });
    render_projects(page);
};

/* open_create_dialog — quick-create dialog for a VT Project; refreshes & routes on save. */
function open_create_dialog(page) {
    const d = new frappe.ui.Dialog({
        title: __("Buat Proyek"),
        fields: [
            { fieldname: "title", label: __("Judul"), fieldtype: "Data", reqd: 1 },
            { fieldname: "project_leader", label: __("Project Leader"), fieldtype: "Link", options: "User" },
            { fieldname: "start_date", label: __("Mulai"), fieldtype: "Date" },
            { fieldname: "end_date", label: __("Selesai"), fieldtype: "Date" },
            { fieldname: "status", label: __("Status"), fieldtype: "Select", options: PROJECT_STATUS_OPTIONS },
        ],
        primary_action_label: __("Simpan"),
        primary_action: (values) => submit_create_dialog(d, values),
    });
    d.show();
}

/* submit_create_dialog — validate, insert VT Project, then hide/alert/route. */
function submit_create_dialog(d, values) {
    if (!values.title) {
        frappe.msgprint(__("Judul wajib diisi."));
        return;
    }
    const doc = { doctype: PROJECT_DOCTYPE, title: values.title };
    ["project_leader", "start_date", "end_date", "status"].forEach((f) => {
        if (values[f]) doc[f] = values[f];
    });
    frappe.db.insert(doc).then((saved) => {
        d.hide();
        frappe.show_alert({ message: __("Proyek dibuat"), indicator: "green" });
        frappe.set_route("vt-project", saved.name);
    }).catch(() => {
        // Surface insert failure (perm/validation) instead of silently leaving the dialog open.
        frappe.show_alert({ message: __("Gagal membuat proyek"), indicator: "red" });
    });
}

function render_projects(page) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    frappe.call(PROJ_API).then((r) => paint_projects(c, r.message || {}));
}

function paint_projects(c, data) {
    const led = data.led || [], member = data.member || [];
    const sec = $('<div class="vh-section"><div class="vh-section-title">Semua Proyek</div></div>');
    c.append(sec);
    if (!led.length && !member.length) {
        sec.append('<div class="vh-empty">Belum ada proyek.</div>');
        return;
    }
    const row = $('<div class="vh-row"></div>');
    sec.append(row);
    led.forEach((p) => row.append(project_card(p)));
    if (member.length) paint_member(sec, member);
}

function project_card(p) {
    const risk_label = frappe.utils.escape_html(PROJ_RISK_LABELS[p.risk] || p.risk || "");
    const chip = `<span class="vh-chip vh-chip-${p.risk}">${risk_label}</span>`;
    const card = $(`<div class="vh-card" style="flex:1 1 240px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${frappe.utils.escape_html(p.name)}</strong>${chip}</div>
        <div class="vh-bar" style="margin:10px 0 6px;"><span style="width:${p.pct_done}%"></span></div>
        <div class="vh-item-meta">${frappe.utils.escape_html(p.status || "")} · ${p.open_tasks} task terbuka · ${p.blockers} blocker</div></div>`);
    card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
    return card;
}

function paint_member(sec, member) {
    const card = $('<div class="vh-card" style="margin-top:16px;"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Sebagai Anggota</div>');
    member.forEach((p) => {
        const item = $(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(p.name)}</span>
            <span class="vh-item-meta">${p.pct_done}% · ${p.my_open_tasks} task saya</span></div>`);
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
        card.append(item);
    });
    sec.append(card);
}
