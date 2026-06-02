/* IIFE wrapper: desk Page scripts are run via frappe.dom.eval as a <script>
   injected into GLOBAL scope. Top-level const/let here would leak globally
   and collide ("Identifier X has already been declared") when another VT
   page declaring the same name was visited first, or on a re-eval — the whole
   script then aborts and the page renders blank. Wrapping isolates every
   declaration to function scope. */
(function () {
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
const PROJECT_DOCTYPE = "VT Project";
const ONB_API = "vernon_tasks.task.api.onboarding";

frappe.pages["vt-home"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Beranda",
        single_column: true,
    });
    page.add_button(__("Refresh"), () => render_all(page), { icon: "refresh" });
    page.set_primary_action(__("Buat Proyek"), () => vt_quick_create_project(), "add");
    render_all(page);
};

function render_all(page) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    render_hero(c);
    render_onboarding(c, page);
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

function vt_quick_create_project(on_done) {
    const d = new frappe.ui.Dialog({
        title: "Buat Proyek",
        fields: [
            { fieldname: "title", label: "Nama Proyek", fieldtype: "Data", reqd: 1 },
            { fieldname: "brand", label: "Brand", fieldtype: "Link", options: "VT Brand", reqd: 1 },
        ],
        primary_action_label: "Buat",
        primary_action: (v) => {
            frappe.db.insert({
                doctype: PROJECT_DOCTYPE, title: v.title, brand: v.brand,
                project_owner: frappe.session.user, project_leader: frappe.session.user,
                start_date: frappe.datetime.get_today(),
                end_date: frappe.datetime.add_days(frappe.datetime.get_today(), 30),
            }).then((doc) => {
                d.hide();
                frappe.show_alert({ message: "Proyek dibuat", indicator: "green" });
                if (on_done) on_done(doc);
                else frappe.set_route("vt-project-detail", doc.name);
            }).catch(() => {
                // Frappe already surfaces the validation error; keep the dialog open for retry.
            });
        },
    });
    d.show();
}

function render_onboarding(c, page) {
    const sec = $('<div class="vh-section" data-block="onboarding"></div>');
    c.append(sec);
    frappe.call(`${ONB_API}.get_onboarding_state`).then((r) => {
        const st = r.message || {};
        if (!st.show) { sec.remove(); return; }
        const card = $('<div class="vh-card vh-onboarding"></div>');
        const head = $('<div class="vh-onb-head"></div>');
        head.append('<span class="vh-section-title">Mulai di sini</span>');
        head.append(`<span class="vh-onb-progress">${st.progress.done}/${st.progress.total}</span>`);
        const dismiss = $('<button class="vh-onb-dismiss btn btn-xs">Sembunyikan</button>');
        dismiss.on("click", () => frappe.call(`${ONB_API}.dismiss_onboarding`).then(() => sec.remove()));
        head.append(dismiss);
        card.append(head);
        (st.steps || []).forEach((s) => card.append(render_onb_step(s)));
        const cta = $('<div class="vh-onb-cta"></div>');
        if (st.has_demo) {
            $('<button class="btn btn-default btn-sm">Hapus data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.clear_demo`).then(() => render_all(page)))
                .appendTo(cta);
        } else {
            $('<button class="btn btn-default btn-sm">Muat data contoh</button>')
                .on("click", () => frappe.call(`${ONB_API}.load_demo`).then(() => render_all(page)))
                .appendTo(cta);
        }
        card.append(cta);
        sec.append(card);
    }).catch(() => sec.remove());
}

function render_onb_step(s) {
    const mark = s.is_complete ? "✓" : "○";
    const row = $(`<div class="vh-onb-step ${s.is_complete ? "done" : ""}">
        <span class="vh-onb-mark">${mark}</span>
        <span class="vh-onb-title">${frappe.utils.escape_html(s.title)}</span></div>`);
    if (!s.is_complete) {
        row.css("cursor", "pointer").on("click", () => onb_route(s));
    }
    return row;
}

function onb_route(s) {
    if (s.route_kind === "page") frappe.set_route(s.route_target);
    else if (s.route_kind === "new_doc") frappe.new_doc(s.route_target);
    else if (s.route_kind === "quick_create_project") vt_quick_create_project();
}

function render_projects(c, data) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Proyek Saya</div></div>');
    const led = data.led || [], member = data.member || [];
    if (!led.length && !member.length) {
        sec.append(vt_render_empty_state({
            title: "Belum ada proyek",
            message: "Buat proyek pertama untuk mulai bekerja, atau muat data contoh dari kartu di atas.",
            cta_label: "Buat Proyek",
            on_cta: () => vt_quick_create_project(),
        }));
    }
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

})();
