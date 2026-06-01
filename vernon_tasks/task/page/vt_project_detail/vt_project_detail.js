/* vt_project_detail.js — desk page: single project management surface.
   Hero (title + meta + progress) + tabs (Kanban | Kalender | Gantt | Milestone |
   Tim | Ringkasan). Kanban is a drag-driven board over board_mutations; task
   create/edit happen in a frappe.ui.Dialog (no inline editing). Kalender uses
   Frappe's bundled FullCalendar v3; Gantt uses frappe-gantt — both lazy-loaded
   via frappe.require and rendered from the same board task set.
   Presentation only — all state-machine rules live in the VT Task controller.
   Route shape: ["vt-project-detail", <project_id>]. */

const DETAIL_API = "vernon_tasks.task.api.dashboard.project_detail";
const BOARD_API = "vernon_tasks.task.api.dashboard.project_board";
const SPRINTS_API = "vernon_tasks.task.api.dashboard.project_sprints";
const MOVE_API = "vernon_tasks.task.api.board_mutations.move_task";
const CREATE_API = "vernon_tasks.task.api.board_mutations.create_task";
const UPDATE_API = "vernon_tasks.task.api.board_mutations.update_task";
const GET_TASK_API = "vernon_tasks.task.api.board_mutations.get_task";

// Roles allowed to set governance fields (points override), mirroring the
// backend LEADER_ONLY_FIELDS gate in board_mutations.py.
const OVERRIDE_ROLES = ["System Manager", "Vernon Admin"];
const RISK_FLAG_OPTIONS = "\nlate\nblocked\nscope-drift";

// Child-table grid columns for the modal (subset shown in the in-dialog grid).
const DEPENDENCY_GRID_FIELDS = [
    { fieldname: "blocked_by", label: "Diblokir Oleh", fieldtype: "Link",
      options: "VT Task", in_list_view: 1, reqd: 1 },
    { fieldname: "dependency_type", label: "Tipe", fieldtype: "Select",
      options: "Finish-to-Start\nStart-to-Start", in_list_view: 1 },
];
const SCHEDULE_GRID_FIELDS = [
    { fieldname: "date", label: "Tanggal", fieldtype: "Date", in_list_view: 1, reqd: 1 },
    { fieldname: "allocated_minutes", label: "Menit", fieldtype: "Float", in_list_view: 1, reqd: 1 },
    { fieldname: "is_override", label: "Override", fieldtype: "Check", in_list_view: 1 },
    { fieldname: "owner_user", label: "Pemilik", fieldtype: "Link", options: "User" },
];

const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };
const PRIORITY_COLORS = { Critical: "#ef4444", High: "#f59e0b", Medium: "#3b82f6", Low: "#94a3b8" };
const SORTABLE_GROUP = "vt-board";
const TASK_DOCTYPE = "VT Task";

// Tabs that render a heavy view lazily on first open (libs/data loaded on
// demand). Sprint pulls its own data; calendar/gantt also load their libs.
const LAZY_TABS = { calendar: render_calendar, gantt: render_gantt, sprint: render_sprints };
const FULLCALENDAR_ASSETS = [
    "assets/frappe/js/lib/fullcalendar/fullcalendar.min.css",
    "assets/frappe/js/lib/fullcalendar/fullcalendar.min.js",
];
const GANTT_ASSETS = [
    "assets/frappe/node_modules/frappe-gantt/dist/frappe-gantt.css",
    "assets/frappe/node_modules/frappe-gantt/dist/frappe-gantt.min.js",
];

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

// Memoised lib loaders — one promise per asset bundle guards against double
// loads when the user toggles lazy tabs quickly.
const _lib_cache = {};
function require_lib(assets) {
    const key = assets.join("|");
    if (!_lib_cache[key]) {
        _lib_cache[key] = new Promise((resolve) => frappe.require(assets, resolve));
    }
    return _lib_cache[key];
}

frappe.pages["vt-project-detail"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({ parent: wrapper, title: "Proyek", single_column: true });
    const id = frappe.get_route()[1];
    if (!id) {
        page.main.empty().append('<div class="vt-home"><div class="vh-empty">Proyek tidak ditemukan.</div></div>');
        return;
    }
    page.add_button(__("Refresh"), () => load_page(page, id), { icon: "refresh" });
    page.add_button(__("Edit"), () => frappe.set_route("Form", "VT Project", id));
    load_page(page, id);
};

function load_page(page, id) {
    const root = $('<div class="vt-home vt-detail"></div>');
    page.main.empty().append(root);
    const ctx = { project_id: id, root };
    Promise.all([
        frappe.call(DETAIL_API, { project_id: id }),
        frappe.call(BOARD_API, { project_id: id }),
    ]).then(([d, b]) => {
        ctx.detail = (d && d.message) || {};
        ctx.board = (b && b.message) || { columns: [], team: [], priorities: [] };
        render_page(ctx);
    });
}

// ── layout ───────────────────────────────────────────────────────────────

function render_page(ctx) {
    ctx.root.empty();
    ctx.root.append(hero_card(ctx.detail));
    ctx.root.append(tabs_bar(ctx));
    const panels = $('<div class="vb-panels"></div>');
    panels.append($('<div class="vb-panel" data-panel="kanban"></div>').append(kanban_body(ctx)));
    panels.append($('<div class="vb-panel" data-panel="calendar" hidden><div class="vb-calendar"></div></div>'));
    panels.append($('<div class="vb-panel" data-panel="gantt" hidden><div class="vb-gantt-wrap"><svg class="vb-gantt"></svg></div></div>'));
    panels.append($('<div class="vb-panel" data-panel="sprint" hidden></div>'));
    panels.append($('<div class="vb-panel" data-panel="milestone" hidden></div>').append(milestones_section(ctx.detail.milestones || [])));
    panels.append($('<div class="vb-panel" data-panel="tim" hidden></div>').append(team_section(ctx.detail.team_members || [])));
    panels.append($('<div class="vb-panel" data-panel="ringkasan" hidden></div>').append(open_tasks_section(ctx.detail.open_tasks || [])));
    ctx.root.append(panels);
}

const TABS = [
    ["kanban", "Kanban"], ["calendar", "Kalender"], ["gantt", "Gantt"],
    ["sprint", "Sprint"], ["milestone", "Milestone"], ["tim", "Tim"],
    ["ringkasan", "Ringkasan"],
];

function tabs_bar(ctx) {
    const bar = $('<div class="vb-tabs"></div>');
    TABS.forEach(([key, label], i) => {
        const t = $(`<button class="vb-tab${i === 0 ? " vb-tab-active" : ""}" data-tab="${key}">${label}</button>`);
        t.on("click", () => switch_tab(ctx, key));
        bar.append(t);
    });
    return bar;
}

function switch_tab(ctx, key) {
    const root = ctx.root;
    root.find(".vb-tab").removeClass("vb-tab-active");
    root.find(`.vb-tab[data-tab="${key}"]`).addClass("vb-tab-active");
    root.find(".vb-panel").attr("hidden", true);
    root.find(`[data-panel="${key}"]`).removeAttr("hidden");
    // Heavy views render on open (need a visible, sized container).
    if (LAZY_TABS[key]) LAZY_TABS[key](ctx);
}

// ── kanban board ───────────────────────────────────────────────────────────

function kanban_body(ctx) {
    const board = $('<div class="vb-board"></div>');
    (ctx.board.columns || []).forEach((col) => board.append(column_el(col, ctx)));
    return board;
}

function column_el(col, ctx) {
    const can_add = !!col.pdca_phase && col.key !== "Done";
    const el = $(`<div class="vb-col" data-col="${esc(col.key)}">
        <div class="vb-col-head">
            <span class="vb-col-title">${esc(col.label)}</span>
            <span class="vb-col-count">${(col.tasks || []).length}</span>
            ${can_add ? '<button class="vb-add" title="Tambah task">+</button>' : ""}
        </div>
        <div class="vb-col-body"></div></div>`);
    const body = el.find(".vb-col-body");
    (col.tasks || []).forEach((t) => body.append(card_el(t, ctx)));
    if (can_add) el.find(".vb-add").on("click", () => open_task_dialog(ctx, { column: col.key }));
    init_sortable(body.get(0), ctx);
    return el;
}

function card_el(task, ctx) {
    const locked = (task.allowed_targets || []).length === 0;
    const card = $(`<div class="vb-card${locked ? " vb-locked" : ""}" data-id="${esc(task.id)}"
        data-allowed='${JSON.stringify(task.allowed_targets || [])}'>
        <div class="vb-card-title">${esc(task.title || task.id)}
            ${task.risk_flag ? '<span class="vh-chip vh-chip-behind">Risiko</span>' : ""}</div>
        <div class="vb-card-meta">${card_meta_html(task, ctx)}</div></div>`);
    card.data("task", task);
    card.on("click", () => open_task_dialog(ctx, { task }));
    return card;
}

function card_meta_html(task, ctx) {
    const chips = [];
    if (task.priority) chips.push(`<span class="vb-chip vb-prio-${esc(task.priority)}">${esc(task.priority)}</span>`);
    if (task.assigned_to) chips.push(`<span class="vb-chip">${esc(assignee_name(ctx, task.assigned_to))}</span>`);
    if (task.deadline) chips.push(`<span class="vb-chip">${esc(task.deadline)}</span>`);
    return chips.join("");
}

function assignee_name(ctx, user) {
    const m = (ctx.board.team || []).find((x) => x.user === user);
    return m ? m.full_name : user;
}

// ── task create / edit dialog ───────────────────────────────────────────────

// Whether the current user may edit governance (points override) fields.
function can_override(ctx) {
    const leader = (ctx.detail && ctx.detail.header && ctx.detail.header.leader) || null;
    if (leader && leader === frappe.session.user) return true;
    return OVERRIDE_ROLES.some((r) => frappe.user.has_role(r));
}

// Board columns that accept a quick-add (PDCA columns except Done), mirroring
// the backend QUICK_ADD_COLUMNS gate in board_mutations.py.
function quick_add_columns(ctx) {
    return (ctx.board.columns || [])
        .filter((c) => c.pdca_phase && c.key !== "Done")
        .map((c) => c.key);
}

// Full editable field set, organised into sections. Mirrors the backend
// EDITABLE_FIELDS allow-list; override fields are appended only for leaders.
// On create (`editing` false) a column picker is prepended so the task can be
// born into any board column — needed when creating from the calendar, which
// (unlike the kanban "+") carries no implicit column.
function dialog_fields(ctx, editing) {
    const priorities = (ctx.board.priorities || []).join("\n");
    const fields = [
        { fieldname: "title", label: "Judul", fieldtype: "Data", reqd: 1 },

        { fieldtype: "Section Break", label: "Klasifikasi" },
        { fieldname: "priority", label: "Prioritas", fieldtype: "Select", options: priorities },
        // risk_flag is surfaced by risk_evaluator — read-only in the form.
        { fieldname: "risk_flag", label: "Tanda Risiko", fieldtype: "Select",
          options: RISK_FLAG_OPTIONS, read_only: 1 },
        { fieldtype: "Column Break" },
        { fieldname: "sprint", label: "Sprint", fieldtype: "Link", options: "VT Sprint" },

        { fieldtype: "Section Break", label: "Penugasan & Jadwal" },
        { fieldname: "assigned_to", label: "Assignee", fieldtype: "Link", options: "User",
          description: "Harus anggota tim proyek." },
        { fieldname: "start_date", label: "Mulai", fieldtype: "Date" },
        { fieldtype: "Column Break" },
        { fieldname: "deadline", label: "Deadline", fieldtype: "Date" },

        { fieldtype: "Section Break", label: "Estimasi & Skor" },
        // DO phase: task estimate in minutes. CHECK phase: review estimate +
        // review date. Both phases keep Bobot. Fields toggle on pdca_phase.
        { fieldname: "estimated_minutes", label: "Estimasi Menit", fieldtype: "Int",
          depends_on: 'eval:doc.pdca_phase=="DO"' },
        { fieldname: "review_estimated_minutes", label: "Estimasi Review (menit)", fieldtype: "Int",
          depends_on: 'eval:doc.pdca_phase=="CHECK"' },
        { fieldname: "review_scheduled_date", label: "Tanggal Review", fieldtype: "Date",
          depends_on: 'eval:doc.pdca_phase=="CHECK"' },
        { fieldtype: "Column Break" },
        { fieldname: "weight", label: "Bobot", fieldtype: "Float", description: "Harus > 0." },
    ];

    if (can_override(ctx)) {
        fields.push(
            { fieldtype: "Section Break", label: "Override Leader" },
            { fieldname: "leader_override_points", label: "Override Poin", fieldtype: "Int" },
            { fieldname: "override_reason", label: "Alasan Override", fieldtype: "Small Text",
              description: "Wajib diisi jika override poin diatur." },
        );
    }

    fields.push(
        { fieldtype: "Section Break", label: "Recurring" },
        { fieldname: "is_recurring", label: "Berulang", fieldtype: "Check" },
        { fieldname: "recurring_rule", label: "Aturan Recurring", fieldtype: "Link",
          options: "Recurring Rule", depends_on: "is_recurring",
          description: "Wajib diisi jika berulang aktif." },
    );

    if (!editing) {
        fields.unshift(
            { fieldname: "column", label: "Kolom", fieldtype: "Select",
              options: quick_add_columns(ctx).join("\n"), reqd: 1,
              description: "Kolom papan tempat task dibuat." },
        );
    }

    fields.push(

        { fieldtype: "Section Break", label: "Dependencies" },
        { fieldname: "dependencies", fieldtype: "Table", options: "Task Dependency",
          fields: DEPENDENCY_GRID_FIELDS },

        { fieldtype: "Section Break", label: "Jadwal Alokasi", collapsible: 1 },
        { fieldname: "schedule_entries", fieldtype: "Table", options: "Task Schedule Entry",
          fields: SCHEDULE_GRID_FIELDS },
    );
    return fields;
}

// `prefill` seeds create-mode fields (e.g. calendar day-click sets deadline);
// `column` preselects the column picker (kanban "+" passes its own column).
function open_task_dialog(ctx, { task, column, prefill }) {
    const editing = !!task;
    const d = new frappe.ui.Dialog({
        title: editing ? "Edit Task" : "Task Baru",
        size: "large",
        fields: dialog_fields(ctx, editing),
        primary_action_label: editing ? "Simpan" : "Buat",
        primary_action: (values) => submit_task_dialog(ctx, d, { task, values }),
    });
    d.show();
    if (editing) {
        // Board card carries only display fields — hydrate from get_task.
        hydrate_edit_dialog(d, task);
        return;
    }
    if (column) d.set_value("column", column);
    if (prefill) Object.keys(prefill).forEach((k) => d.set_value(k, prefill[k]));
}

// Populate the edit dialog with the task's full editable field set (incl. child
// tables) fetched from the backend; the card alone lacks most fields.
function hydrate_edit_dialog(dialog, task) {
    frappe.call(GET_TASK_API, { task_id: task.id }).then((r) => {
        const data = (r && r.message) || {};
        Object.keys(data).forEach((field) => {
            const df = dialog.fields_dict[field];
            if (df && data[field] != null) dialog.set_value(field, data[field]);
        });
    });
}

function submit_task_dialog(ctx, dialog, { task, values }) {
    if (values.start_date && values.deadline && values.start_date >= values.deadline) {
        frappe.msgprint(__("Tanggal mulai harus sebelum deadline."));
        return;
    }
    const done = () => { dialog.hide(); reload_board(ctx); };
    if (task) {
        frappe.call(UPDATE_API, { task_id: task.id, values }).then(done);
        return;
    }
    // Create: column comes from the dialog picker (extra `values.column` is
    // ignored by the backend EDITABLE_FIELDS allow-list).
    if (!values.column) {
        frappe.msgprint(__("Pilih kolom untuk task baru."));
        return;
    }
    frappe.call(CREATE_API, { project_id: ctx.project_id, title: values.title, column: values.column, values })
        .then(done);
}

// ── drag interactions ───────────────────────────────────────────────────────

function init_sortable(body_el, ctx) {
    if (!window.Sortable || !body_el) return;
    new Sortable(body_el, {
        group: SORTABLE_GROUP,
        draggable: ".vb-card:not(.vb-locked)",
        animation: 120,
        onStart: (evt) => highlight_targets(ctx, evt),
        onMove: (evt) => can_drop(evt),
        onEnd: (evt) => { clear_highlight(ctx); on_card_drop(evt, ctx); },
    });
}

function col_key(node) {
    const col = node && node.closest(".vb-col");
    return col ? col.dataset.col : null;
}

function highlight_targets(ctx, evt) {
    const allowed = JSON.parse(evt.item.dataset.allowed || "[]");
    const from = col_key(evt.from);
    ctx.root.find(".vb-col").each(function () {
        const ok = this.dataset.col === from || allowed.includes(this.dataset.col);
        this.classList.toggle("vb-drop-ok", ok);
        this.classList.toggle("vb-drop-no", !ok);
    });
}

function clear_highlight(ctx) {
    ctx.root.find(".vb-col").removeClass("vb-drop-ok vb-drop-no");
}

function can_drop(evt) {
    const allowed = JSON.parse(evt.dragged.dataset.allowed || "[]");
    const to = col_key(evt.to);
    return to === col_key(evt.from) || allowed.includes(to);
}

function on_card_drop(evt, ctx) {
    const to = col_key(evt.to);
    if (!to || to === col_key(evt.from)) return;
    frappe.call(MOVE_API, { task_id: evt.item.dataset.id, to_column: to })
        .then(() => reload_board(ctx))
        .catch(() => reload_board(ctx)); // server rejected → revert DOM
}

function reload_board(ctx) {
    frappe.call(BOARD_API, { project_id: ctx.project_id }).then((r) => {
        ctx.board = (r && r.message) || { columns: [], team: [], priorities: [] };
        ctx.root.find('[data-panel="kanban"]').empty().append(kanban_body(ctx));
        // Lazy views hold a stale snapshot — re-render the one currently open.
        const active = ctx.root.find(".vb-tab-active").data("tab");
        if (LAZY_TABS[active]) LAZY_TABS[active](ctx);
    });
}

// ── calendar + gantt (lazy) ─────────────────────────────────────────────────

function all_board_tasks(ctx) {
    return (ctx.board.columns || []).flatMap((c) => c.tasks || []);
}

function render_calendar(ctx) {
    const el = ctx.root.find(".vb-calendar");
    require_lib(FULLCALENDAR_ASSETS).then(() => {
        const events = calendar_events(all_board_tasks(ctx));
        el.empty().fullCalendar({
            header: { left: "prev,next today", center: "title", right: "month,agendaWeek" },
            height: "auto",
            events,
            // Click an empty day → create a task with that day as deadline
            // (calendar events are keyed on deadline). Column is chosen in dialog.
            dayClick: (date) => open_task_dialog(ctx, { prefill: { deadline: date.format("YYYY-MM-DD") } }),
            eventClick: (ev) => { frappe.set_route("Form", TASK_DOCTYPE, ev.id); return false; },
        });
        // Grid still renders when empty; hint that clicking a day creates a task.
        el.find(".vb-empty").remove();
        if (!events.length) {
            el.prepend('<div class="vb-empty">Belum ada task bertanggal. Klik tanggal untuk membuat task.</div>');
        }
    });
}

function calendar_events(tasks) {
    // A task lands on its deadline (or start_date as fallback); undated tasks
    // have no calendar slot and are intentionally omitted.
    return tasks
        .filter((t) => t.deadline || t.start_date)
        .map((t) => ({
            id: t.id, title: t.title || t.id,
            start: t.deadline || t.start_date,
            color: PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.Low,
        }));
}

function render_gantt(ctx) {
    const wrap = ctx.root.find(".vb-gantt-wrap");
    const el = ctx.root.find(".vb-gantt").get(0);
    require_lib(GANTT_ASSETS).then(() => {
        const rows = gantt_tasks(all_board_tasks(ctx));
        $(el).empty();
        wrap.find(".vb-empty").remove();
        // frappe-gantt draws nothing without dated tasks — show why instead of
        // leaving the panel blank.
        if (!rows.length) {
            wrap.append('<div class="vb-empty">Belum ada task bertanggal. Tetapkan tanggal mulai atau deadline pada task untuk melihat Gantt.</div>');
            return;
        }
        new Gantt(el, rows, {
            view_mode: "Week", date_format: "YYYY-MM-DD",
            on_click: (t) => frappe.set_route("Form", TASK_DOCTYPE, t.id),
        });
    });
}

// ── sprint tab (lazy) ────────────────────────────────────────────────────────

function render_sprints(ctx) {
    const panel = ctx.root.find('[data-panel="sprint"]');
    panel.empty().append('<div class="vh-empty">Memuat sprint…</div>');
    frappe.call(SPRINTS_API, { project_id: ctx.project_id }).then((r) => {
        const data = (r && r.message) || { sprints: [], unassigned: [] };
        panel.empty().append(sprints_view(ctx, data));
    });
}

function sprints_view(ctx, data) {
    const sec = section_shell("Sprint");
    const sprints = data.sprints || [];
    const unassigned = data.unassigned || [];
    if (!sprints.length && !unassigned.length) {
        return sec.append('<div class="vh-empty">Belum ada sprint untuk proyek ini.</div>');
    }
    sprints.forEach((s) => sec.append(sprint_card(ctx, s)));
    if (unassigned.length) {
        sec.append(sprint_card(ctx, {
            id: "__unassigned__", title: "Tanpa Sprint", tasks: unassigned,
        }));
    }
    return sec;
}

// One collapsible sprint: header (range/status/progress) + its task list.
function sprint_card(ctx, s) {
    const range = [s.start_date, s.end_date].filter(Boolean).map(esc).join(" – ");
    const pct = s.percent_done || 0;
    const meta = [range, s.status].filter(Boolean).map(esc).join(" · ");
    const card = $(`<div class="vb-sprint">
        <div class="vb-sprint-head">
            <span class="vb-sprint-title">${esc(s.title)}</span>
            <span class="vb-sprint-meta">${meta}${meta ? " · " : ""}${(s.tasks || []).length} task</span>
        </div>
        ${s.goal ? `<div class="vb-sprint-goal">${esc(s.goal)}</div>` : ""}
        ${s.percent_done != null && s.id !== "__unassigned__"
            ? `<div class="vh-bar"><span style="width:${pct}%"></span></div>` : ""}
        <div class="vb-sprint-body"></div></div>`);
    const body = card.find(".vb-sprint-body");
    const tasks = s.tasks || [];
    if (!tasks.length) {
        body.append('<div class="vh-empty">Tidak ada task.</div>');
    } else {
        tasks.forEach((t) => body.append(sprint_task_row(ctx, t)));
    }
    return card;
}

function sprint_task_row(ctx, t) {
    const meta = [t.kanban_status, t.priority, t.deadline].filter(Boolean).map(esc).join(" · ");
    const flag = t.risk_flag ? '<span class="vh-chip vh-chip-behind">Berisiko</span>' : "";
    const row = $(`<div class="vh-item vb-sprint-task"><span class="vh-item-title">${esc(t.title || t.id)}</span>
        <span class="vh-item-meta">${meta}</span>${flag}</div>`);
    // Reuse the board edit dialog so sprint tasks are editable in place.
    row.on("click", () => open_task_dialog(ctx, { task: t }));
    return row;
}

function gantt_tasks(tasks) {
    // frappe-gantt needs both start and end; collapse to a single-day bar when
    // only one date exists, and skip tasks with neither (controller guarantees
    // start_date < deadline when both are set).
    return tasks
        .filter((t) => t.deadline || t.start_date)
        .map((t) => {
            const start = t.start_date || t.deadline;
            const end = t.deadline || t.start_date;
            return { id: t.id, name: t.title || t.id, start, end, progress: 0 };
        });
}

// ── hero + non-kanban sections ──────────────────────────────────────────────

function risk_chip(risk) {
    return `<span class="vh-chip vh-chip-${risk}">${esc(PROJ_RISK_LABELS[risk] || risk)}</span>`;
}

function hero_meta_row(h, counts, blockers) {
    const chips = [];
    if (h.leader) chips.push(`<span class="vb-meta-chip">👤 ${esc(h.leader)}</span>`);
    if (h.start_date || h.end_date) chips.push(`<span class="vb-meta-chip">📅 ${esc(h.start_date || "?")} – ${esc(h.end_date || "?")}</span>`);
    if (h.pdca_phase) chips.push(`<span class="vb-meta-chip">🔄 ${esc(h.pdca_phase)}</span>`);
    if (h.sprint) chips.push(`<span class="vb-meta-chip">🏃 ${esc(h.sprint)}</span>`);
    chips.push(`<span class="vb-meta-chip">✅ ${counts.done || 0}/${counts.total || 0} · ${counts.open || 0} terbuka</span>`);
    if (blockers) chips.push(`<span class="vb-meta-chip vb-meta-warn">⛔ ${blockers} blocker</span>`);
    return `<div class="vb-hero-meta">${chips.join("")}</div>`;
}

function hero_card(detail) {
    const h = detail.header || {};
    const counts = detail.counts || {};
    const pct = h.percent_done || 0;
    return $(`<div class="vh-card vb-hero">
        <div class="vb-hero-top">
            <strong>${esc(h.title || h.id)}</strong>
            <span class="vb-hero-chips"><span class="vh-chip">${esc(h.status)}</span>${risk_chip(h.risk)}</span></div>
        ${hero_meta_row(h, counts, detail.blockers || 0)}
        <div class="vh-bar vb-hero-bar"><span style="width:${pct}%"></span></div></div>`);
}

function section_shell(title) {
    return $(`<div class="vh-section"><div class="vh-section-title">${title}</div></div>`);
}

function open_tasks_section(tasks) {
    const sec = section_shell("Task Terbuka");
    if (!tasks.length) return sec.append('<div class="vh-empty">Tidak ada task terbuka.</div>');
    tasks.forEach((t) => sec.append(task_row(t)));
    return sec;
}

function task_row(t) {
    const meta = [t.kanban_status, t.priority, t.deadline].filter(Boolean).map(esc).join(" · ");
    const flag = t.risk_flag ? '<span class="vh-chip vh-chip-behind">Berisiko</span>' : "";
    return $(`<div class="vh-item"><span class="vh-item-title">${esc(t.title || t.id)}</span>
        <span class="vh-item-meta">${meta}</span>${flag}</div>`);
}

function team_section(members) {
    const sec = section_shell("Tim");
    if (!members.length) return sec.append('<div class="vh-empty">Belum ada anggota.</div>');
    members.forEach((m) => sec.append(`<div class="vh-item"><span class="vh-item-title">${esc(m.user)}</span>
        <span class="vh-item-meta">${esc(m.role)}</span></div>`));
    return sec;
}

function milestones_section(milestones) {
    const sec = section_shell("Milestone");
    if (!milestones.length) return sec.append('<div class="vh-empty">Belum ada milestone.</div>');
    milestones.forEach((m) => {
        const meta = [m.due_date, m.status].filter(Boolean).map(esc).join(" · ");
        sec.append(`<div class="vh-item"><span class="vh-item-title">${esc(m.title)}</span>
            <span class="vh-item-meta">${meta}</span></div>`);
    });
    return sec;
}
