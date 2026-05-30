/* vt_project.js — desk page: single project detail dashboard.
   Reuses vernon_tasks.task.api.dashboard.project_detail. Presentation only.
   Route shape: ["vt-project", <project_id>]. */

const DETAIL_API = "vernon_tasks.task.api.dashboard.project_detail";
const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };

frappe.pages["vt-project"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Proyek",
        single_column: true,
    });
    const id = frappe.get_route()[1];
    if (!id) {
        page.main.empty().append(
            '<div class="vt-home"><div class="vh-empty">Proyek tidak ditemukan.</div></div>'
        );
        return;
    }
    page.add_button(__("Refresh"), () => load_detail(page, id), { icon: "refresh" });
    page.add_button(__("Edit"), () => frappe.set_route("Form", "VT Project", id));
    load_detail(page, id);
};

function load_detail(page, id) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    frappe.call(DETAIL_API, { project_id: id }).then((r) => render_detail(c, r.message || {}));
}

function render_detail(c, data) {
    const h = data.header || {};
    c.append(hero_card(h));
    c.append(open_tasks_section(data.open_tasks || []));
    c.append(team_section(data.team_members || []));
    c.append(milestones_section(data.milestones || []));
}

function risk_chip(risk) {
    const label = frappe.utils.escape_html(PROJ_RISK_LABELS[risk] || risk || "");
    return `<span class="vh-chip vh-chip-${risk}">${label}</span>`;
}

function hero_meta(h) {
    const parts = [];
    if (h.leader) parts.push(frappe.utils.escape_html(h.leader));
    if (h.start_date || h.end_date)
        parts.push(`${h.start_date || "?"}–${h.end_date || "?"}`);
    if (h.pdca_phase) parts.push(frappe.utils.escape_html(h.pdca_phase));
    return parts.join(" · ");
}

function hero_card(h) {
    const status = frappe.utils.escape_html(h.status || "");
    const pct = h.percent_done || 0;
    return $(`<div class="vh-card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${frappe.utils.escape_html(h.title || h.id || "")}</strong>
            <span style="display:flex;gap:6px;">
                <span class="vh-chip">${status}</span>${risk_chip(h.risk)}</span></div>
        <div class="vh-bar" style="margin:10px 0 6px;"><span style="width:${pct}%"></span></div>
        <div class="vh-item-meta">${hero_meta(h)}</div></div>`);
}

function section_shell(title) {
    return $(`<div class="vh-section"><div class="vh-section-title">${title}</div></div>`);
}

function open_tasks_section(tasks) {
    const sec = section_shell("Task Terbuka");
    if (!tasks.length) {
        sec.append('<div class="vh-empty">Tidak ada task terbuka.</div>');
        return sec;
    }
    tasks.forEach((t) => sec.append(task_row(t)));
    return sec;
}

function task_row(t) {
    const meta = [t.kanban_status, t.priority, t.deadline]
        .filter(Boolean)
        .map((x) => frappe.utils.escape_html(x))
        .join(" · ");
    const flag = t.risk_flag
        ? '<span class="vh-chip vh-chip-behind">Berisiko</span>'
        : "";
    return $(`<div class="vh-item"><span class="vh-item-title">
        ${frappe.utils.escape_html(t.title || t.id || "")}</span>
        <span class="vh-item-meta">${meta}</span>${flag}</div>`);
}

function team_section(members) {
    const sec = section_shell("Tim");
    if (!members.length) {
        sec.append('<div class="vh-empty">Belum ada anggota.</div>');
        return sec;
    }
    members.forEach((m) => {
        sec.append(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(m.user || "")}</span>
            <span class="vh-item-meta">${frappe.utils.escape_html(m.role || "")}</span></div>`);
    });
    return sec;
}

function milestones_section(milestones) {
    const sec = section_shell("Milestone");
    if (!milestones.length) {
        sec.append('<div class="vh-empty">Belum ada milestone.</div>');
        return sec;
    }
    milestones.forEach((m) => {
        const meta = [m.due_date, m.status]
            .filter(Boolean)
            .map((x) => frappe.utils.escape_html(x))
            .join(" · ");
        sec.append(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(m.title || "")}</span>
            <span class="vh-item-meta">${meta}</span></div>`);
    });
    return sec;
}
