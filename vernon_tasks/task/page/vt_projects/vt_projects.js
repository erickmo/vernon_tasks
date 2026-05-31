/* vt_projects.js — desk page listing projects as cards.
   Reuses vernon_tasks.task.api.dashboard.my_projects. Presentation only. */

const PROJ_API = "vernon_tasks.task.api.dashboard.my_projects";
const PROJECT_DOCTYPE = "VT Project";
const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };

frappe.pages["vt-projects"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Proyek",
        single_column: true,
    });
    // Buat Proyek opens the original VT Project form instead of a quick-create dialog.
    page.set_primary_action(__("Buat Proyek"), () => frappe.new_doc(PROJECT_DOCTYPE), "add");
    page.add_button(__("Refresh"), () => render_projects(page), { icon: "refresh" });
    render_projects(page);
};

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
    card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project-detail", p.id));
    return card;
}

function paint_member(sec, member) {
    const card = $('<div class="vh-card" style="margin-top:16px;"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Sebagai Anggota</div>');
    member.forEach((p) => {
        const item = $(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(p.name)}</span>
            <span class="vh-item-meta">${p.pct_done}% · ${p.my_open_tasks} task saya</span></div>`);
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project-detail", p.id));
        card.append(item);
    });
    sec.append(card);
}
