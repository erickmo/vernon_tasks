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
const COMPLETIONS_CHART_HEIGHT = 180;
const COMPLETIONS_COLOR = "#5e64ff";
const HOURS_COLORS = ["#2563eb", "#e0e0e0"];
const PHASE_COLORS = {
    BACKLOG: "#b0bec5", PLAN: "#5e64ff", DO: "#ff9800",
    CHECK: "#7c4dff", ACT: "#00bcd4", DONE: "#4caf50",
};
const PHASE_COLOR_FALLBACK = "#9e9e9e";
const TEAM_CHART_HEIGHT = 200;
const LEADERBOARD_COLOR = "#5e64ff";
const QUICK_LINKS = [
    { label: "Task Saya", route: "List/VT Task" },
    { label: "Task Baru", route: "vt-task/new" },
    { label: "Proyek", route: "List/VT Project" },
    { label: "Sprint", route: "List/VT Sprint" },
];
const PROJECT_DOCTYPE = "VT Project";
const ONB_API = "vernon_tasks.task.api.onboarding";

// Module-scoped lazy state for the Tim tab (reset on every Refresh).
let team_loaded = false;

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

// Build the tab strip + two panels into page.main, wire tab switching, and
// return the strip element. Tim panel stays hidden until probe_team_tab reveals
// the button; team_overview is fetched lazily on first Tim activation.
function build_tabs(page) {
    const el = $(`
        <div>
            <div class="vh-tabs">
                <button class="vh-tab active" data-tab="beranda">Beranda</button>
                <button class="vh-tab" data-tab="tim" style="display:none;">Tim</button>
            </div>
            <div class="vh-panel vt-home" data-panel="beranda"></div>
            <div class="vh-panel vt-home" data-panel="tim" style="display:none;"></div>
        </div>
    `);
    page.main.empty().append(el);
    el.find(".vh-tab").on("click", function () {
        const tab = $(this).data("tab");
        el.find(".vh-tab").removeClass("active");
        $(this).addClass("active");
        el.find(".vh-panel").hide();
        el.find(`.vh-panel[data-panel="${tab}"]`).show();
        if (tab === "tim") render_team_tab();
    });
    return el;
}

function render_all(page) {
    const tabs = build_tabs(page);
    render_beranda(tabs.find('.vh-panel[data-panel="beranda"]'), page);
    team_loaded = false;
    probe_team_tab(tabs);
}

// Personal POV — runs immediately into the Beranda panel.
function render_beranda(c, page) {
    c.empty();
    render_hero(c);
    render_onboarding(c, page);
    frappe.call(`${API}.me_progress`).then((r) => render_progress(c, r.message || {}));
    frappe.call(`${API}.my_projects`).then((r) => render_projects(c, r.message || {}));
    frappe.call(`${API}.daily_completions`).then((r) => render_completions(c, r.message || []));
    frappe.call(`${API}.hours_summary`).then((r) => render_hours(c, r.message || {}));
    frappe.call(`${API}.schedule_agenda`).then((r) => render_schedule(c, r.message || {}));
    render_quick_links(c);
}

// Reveal the Tim tab button only when the caller is eligible (leads >=1 project,
// or is Manager/admin). Scope is decided server-side; this is a visibility hint.
function probe_team_tab(tabs) {
    frappe.call(`${API}.team_tab_state`).then((r) => {
        if ((r.message || {}).visible) {
            tabs.find('.vh-tab[data-tab="tim"]').show();
        }
    });
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

// Last-7-days completed-task bar chart (ports my_dashboard render_bar_chart).
// Beranda panel is rebuilt fresh each render, so a new frappe.Chart per call is
// fine — no instance reuse needed.
function render_completions(c, rows) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Task Selesai — 7 Hari</div></div>');
    const card = $('<div class="vh-card"><div id="vh-completions-chart"></div></div>');
    sec.append(card);
    c.append(sec);
    const data = rows || [];
    const labels = data.map((d) => frappe.datetime.str_to_user(d.date));
    const values = data.map((d) => d.count);
    new frappe.Chart("#vh-completions-chart", {
        type: "bar",
        height: COMPLETIONS_CHART_HEIGHT,
        colors: [COMPLETIONS_COLOR],
        data: { labels, datasets: [{ values }] },
        tooltipOptions: { formatTooltipY: (d) => (d ?? 0) + " task" },
    });
}

// Logged-vs-remaining hours donut (ports my_dashboard render_donut_chart).
// Backend now returns HOURS (logged_hours/remaining_hours) — unit bug fixed.
function render_hours(c, d) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Jam: Tercatat vs Sisa</div></div>');
    const card = $('<div class="vh-card"><div id="vh-hours-chart"></div></div>');
    sec.append(card);
    c.append(sec);
    const logged = d.logged_hours || 0;
    const remaining = d.remaining_hours || 0;
    if (logged === 0 && remaining === 0) {
        card.find("#vh-hours-chart").html('<div class="vh-empty">Tidak ada task aktif.</div>');
        return;
    }
    new frappe.Chart("#vh-hours-chart", {
        type: "donut",
        height: COMPLETIONS_CHART_HEIGHT,
        colors: HOURS_COLORS,
        data: { labels: ["Tercatat", "Sisa"], datasets: [{ values: [logged, remaining] }] },
        tooltipOptions: { formatTooltipY: (v) => (v ?? 0).toFixed(1) + " jam" },
    });
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

// ── Shared helpers (used by Tim renderers; ported from leader_dashboard.js) ──

const esc = (s) => frappe.utils.escape_html(String(s || ""));

function fmt_deadline(d) {
    if (!d) return "—";
    const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
    if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
    return frappe.datetime.str_to_user(d);
}

// ── Tim tab renderers ──

// Lazy: fetch + render the Tim panel once per render_all cycle. Panel is already
// visible (tab click shows it) before charts build, so width measurement is fine.
function render_team_tab() {
    if (team_loaded) return;
    team_loaded = true;
    const panel = $('.vh-panel[data-panel="tim"]');
    panel.empty();
    frappe.call(`${API}.team_overview`).then((r) => {
        const d = r.message || {};
        render_team_stats(panel, d.stats || {});
        render_team_charts(panel, d.phase_distribution || [], d.leaderboard || []);
        render_team_overdue(panel, d.overdue || []);
    });
}

// Three KPI cards: Pending Review, Approval Rate %, Team Points (month).
// Uses existing .vh-row / .vh-card.vh-stat / .vh-num / .vh-lbl classes
// (same pattern as render_progress workload cards — no new CSS needed).
function render_team_stats(c, s) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Tim</div></div>');
    const row = $('<div class="vh-row"></div>');
    const pending = s.pending_review ?? 0;
    const approval = typeof s.approval_rate === "number" ? s.approval_rate.toFixed(1) + "%" : "—";
    const points = typeof s.team_points_month === "number" ? s.team_points_month.toFixed(1) : "0";
    [["Pending Review", pending], ["Approval Rate", approval], ["Poin Tim (Bulan)", points]]
        .forEach(([label, val]) => {
            row.append(`<div class="vh-card vh-stat">
                <div class="vh-num">${esc(val)}</div>
                <div class="vh-lbl">${esc(label)}</div></div>`);
        });
    sec.append(row);
    c.append(sec);
}

// PDCA donut + points leaderboard bar, side by side.
function render_team_charts(c, phase_rows, board_rows) {
    const sec = $('<div class="vh-section"></div>');
    const wrap = $('<div style="display:flex; gap:16px; flex-wrap:wrap;"></div>');
    wrap.append('<div class="vh-card" style="flex:1; min-width:220px;"><div class="vh-section-title">Distribusi Fase PDCA</div><div id="vh-team-donut"></div></div>');
    wrap.append('<div class="vh-card" style="flex:2; min-width:300px;"><div class="vh-section-title">Leaderboard Poin (Bulan)</div><div id="vh-team-bar"></div></div>');
    sec.append(wrap);
    c.append(sec);

    if (phase_rows.length) {
        new frappe.Chart("#vh-team-donut", {
            type: "donut", height: TEAM_CHART_HEIGHT,
            colors: phase_rows.map((r) => PHASE_COLORS[r.phase] || PHASE_COLOR_FALLBACK),
            data: { labels: phase_rows.map((r) => r.phase), datasets: [{ values: phase_rows.map((r) => r.count) }] },
        });
    } else {
        $("#vh-team-donut").html('<div class="vh-empty">Tidak ada task.</div>');
    }

    if (board_rows.length) {
        new frappe.Chart("#vh-team-bar", {
            type: "bar", height: TEAM_CHART_HEIGHT, colors: [LEADERBOARD_COLOR],
            data: {
                labels: board_rows.map((d) => (d.member ? d.member.split("@")[0] : "Unassigned")),
                datasets: [{ values: board_rows.map((d) => d.points) }],
            },
            tooltipOptions: { formatTooltipY: (d) => (d || 0).toFixed(1) + " pts" },
        });
    } else {
        $("#vh-team-bar").html('<div class="vh-empty">Belum ada poin bulan ini.</div>');
    }
}

// Overdue tasks table (team-wide or led-scoped per server resolution).
function render_team_overdue(c, rows) {
    const sec = $(`<div class="vh-section"><div class="vh-section-title">Task Terlambat (${rows.length})</div></div>`);
    const card = $('<div class="vh-card"></div>');
    if (!rows.length) {
        card.html('<div class="vh-empty">Tidak ada task terlambat.</div>');
    } else {
        const body = rows.map((t) => `
            <tr>
                <td>${esc(t.member)}</td>
                <td><a href="/app/vt-task/${esc(t.task_name)}" target="_blank">${esc(t.task_title)}</a></td>
                <td>${fmt_deadline(t.deadline)}</td>
                <td><span style="color:var(--red-500); font-weight:600;">${t.days_overdue ?? 0}d</span></td>
                <td>${esc(t.phase)}</td>
            </tr>`).join("");
        card.html(`<table class="table table-sm" style="margin:0;">
            <thead><tr><th>Member</th><th>Task</th><th>Deadline</th><th>Telat</th><th>Fase</th></tr></thead>
            <tbody>${body}</tbody></table>`);
    }
    sec.append(card);
    c.append(sec);
}

})();
