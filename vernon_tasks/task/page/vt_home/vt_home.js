/* vt_home.js — desk dashboard render layer (presentation only).
   Calls existing whitelisted APIs in vernon_tasks.task.api.dashboard.
   No business logic: fetch → render. */

const API = "vernon_tasks.task.api.dashboard";
const RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };
const NEXT_ACTIONS_SHOWN = 5;
const VELOCITY_CHART_HEIGHT = 180;
const BRAND_BLUE = "#2563eb";
const QUICK_LINKS = [
    { label: "Task Saya", route: "List/VT Task" },
    { label: "Task Baru", route: "vt-task/new" },
    { label: "Proyek", route: "List/VT Project" },
    { label: "Sprint", route: "List/VT Sprint" },
];

frappe.pages["vt-home"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Beranda",
        single_column: true,
    });
    page.add_button(__("Refresh"), () => render_all(page), { icon: "refresh" });
    render_all(page);
};

function render_all(page) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    render_hero(c);
    frappe.call(`${API}.me_progress`).then((r) => render_progress(c, r.message || {}));
    frappe.call(`${API}.my_projects`).then((r) => render_projects(c, r.message || {}));
    frappe.call(`${API}.schedule_agenda`).then((r) => render_schedule(c, r.message || {}));
    render_quick_links(c);
}

function render_hero(c) {
    const name = frappe.utils.escape_html(frappe.user.full_name() || "");
    const hero = $(`
        <div class="vh-hero">
            <div class="vh-eyebrow">Workspace Vernon</div>
            <div class="vh-greeting">Selamat datang, <span>${name}</span></div>
        </div>`);
    c.append(hero);
    c.append('<div class="vh-row" data-block="workload"></div>');
}

function render_progress(c, data) {
    const w = data.workload || { open: 0, overdue: 0, due_soon: 0 };
    const cards = [
        ["Task Terbuka", w.open], ["Terlambat", w.overdue], ["Jatuh Tempo", w.due_soon],
    ];
    const row = c.find('[data-block="workload"]').empty();
    cards.forEach(([lbl, num]) => row.append(
        `<div class="vh-card vh-stat"><div class="vh-num">${num}</div>
         <div class="vh-lbl">${lbl}</div></div>`));

    // Append to the DOM BEFORE rendering the chart: frappe.Chart measures the
    // container width on construction, and a detached node yields width NaN.
    const sec = $('<div class="vh-section"><div class="vh-section-title">Progres Saya</div></div>');
    c.append(sec);
    render_velocity(sec, data.velocity || []);
    render_sprint(sec, data.sprint);
    render_next_actions(sec, data.next_actions || []);
}

function render_velocity(sec, weeks) {
    const card = $('<div class="vh-card" style="margin-bottom:16px;"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Velocity 8 minggu</div>');
    sec.append(card);
    if (!weeks.length) { card.append('<div class="vh-empty">Belum ada data velocity.</div>'); return; }
    const chartEl = $('<div></div>');
    card.append(chartEl);
    new frappe.Chart(chartEl[0], {
        type: "bar", height: VELOCITY_CHART_HEIGHT, colors: [BRAND_BLUE],
        data: {
            labels: weeks.map((x) => x.week.replace(/^\d+-/, "")),
            datasets: [{ name: "Selesai", values: weeks.map((x) => x.done) }],
        },
    });
}

function render_sprint(sec, sprint) {
    if (!sprint) { sec.append('<div class="vh-empty">Tidak ada sprint aktif.</div>'); return; }
    const chip = `<span class="vh-chip vh-chip-${sprint.risk}">${RISK_LABELS[sprint.risk] || sprint.risk}</span>`;
    sec.append(`
        <div class="vh-card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${frappe.utils.escape_html(sprint.name)}</strong>${chip}
            </div>
            <div class="vh-bar" style="margin-top:10px;"><span style="width:${sprint.progress_pct}%"></span></div>
            <div class="vh-item-meta" style="margin-top:6px;">
                ${sprint.done_points}/${sprint.committed_points} poin · ${sprint.progress_pct}%</div>
        </div>`);
}

function render_next_actions(sec, actions) {
    const card = $('<div class="vh-card"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Aksi Berikutnya</div>');
    if (!actions.length) { card.append('<div class="vh-empty">Tidak ada task aktif.</div>'); }
    actions.slice(0, NEXT_ACTIONS_SHOWN).forEach((a) => {
        const due = a.deadline ? frappe.utils.escape_html(frappe.datetime.str_to_user(a.deadline)) : "—";
        const item = $(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(a.title || a.id)}</span>
            <span class="vh-item-meta">${due}</span></div>`);
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-task", a.id));
        card.append(item);
    });
    sec.append(card);
}

function render_projects(c, data) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Proyek Saya</div></div>');
    const led = data.led || [], member = data.member || [];
    if (!led.length && !member.length) { sec.append('<div class="vh-empty">Belum ada proyek.</div>'); }
    const row = $('<div class="vh-row"></div>');
    led.forEach((p) => {
        const chip = `<span class="vh-chip vh-chip-${p.risk}">${RISK_LABELS[p.risk] || p.risk}</span>`;
        const card = $(`<div class="vh-card" style="flex:1 1 240px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${frappe.utils.escape_html(p.name)}</strong>${chip}</div>
            <div class="vh-bar" style="margin:10px 0 6px;"><span style="width:${p.pct_done}%"></span></div>
            <div class="vh-item-meta">${p.open_tasks} task terbuka · ${p.blockers} blocker</div></div>`);
        card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project-detail", p.id));
        row.append(card);
    });
    sec.append(row);
    if (member.length) render_member_projects(sec, member);
    c.append(sec);
}

function render_member_projects(sec, member) {
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

function render_schedule(c, data) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Jadwal 8 Hari</div></div>');
    const days = data.days || [];
    if (!days.length) { sec.append('<div class="vh-empty">Tidak ada agenda.</div>'); c.append(sec); return; }
    const card = $('<div class="vh-card"></div>');
    days.forEach((d) => {
        card.append(`<div class="vh-day-label">${frappe.utils.escape_html(d.label)}</div>`);
        d.items.forEach((it) => {
            const time = it.time ? `${it.time} · ` : "";
            const item = $(`<div class="vh-item"><span class="vh-item-title">
                ${frappe.utils.escape_html(it.title || it.id)}</span>
                <span class="vh-item-meta">${time}${it.type}</span></div>`);
            if (it.route) item.css("cursor", "pointer").on("click", () => frappe.set_route(it.route));
            card.append(item);
        });
    });
    sec.append(card);
    c.append(sec);
}

function render_quick_links(c) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Akses Cepat</div></div>');
    const quick = $('<div class="vh-quick"></div>');
    QUICK_LINKS.forEach((l) => {
        const btn = $(`<button>${frappe.utils.escape_html(l.label)}</button>`);
        btn.on("click", () => frappe.set_route(l.route));
        quick.append(btn);
    });
    sec.append(quick);
    c.append(sec);
}
