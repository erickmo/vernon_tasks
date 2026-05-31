/* vt_project_detail.js — desk page: single project management surface.
   Hero + tabs (Kanban | Milestone | Tim | Ringkasan). The Kanban tab is a
   drag-driven board over vernon_tasks.task.api.board_mutations; reads come from
   dashboard.project_detail (hero/milestone/team) + dashboard.project_board.
   Presentation only — all state-machine rules live in the VT Task controller.
   Route shape: ["vt-project-detail", <project_id>]. */

const DETAIL_API = "vernon_tasks.task.api.dashboard.project_detail";
const BOARD_API = "vernon_tasks.task.api.dashboard.project_board";
const MOVE_API = "vernon_tasks.task.api.board_mutations.move_task";
const CREATE_API = "vernon_tasks.task.api.board_mutations.create_task";
const PATCH_API = "vernon_tasks.task.api.board_mutations.patch_task";

const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };
const SORTABLE_GROUP = "vt-board";
const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

frappe.pages["vt-project-detail"].on_page_load = function (wrapper) {
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
    bind_card_events(ctx);
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
    ctx.root.append(hero_card(ctx.detail.header || {}));
    ctx.root.append(tabs_bar());
    const panels = $('<div class="vb-panels"></div>');
    panels.append($('<div class="vb-panel" data-panel="kanban"></div>').append(kanban_body(ctx)));
    panels.append($('<div class="vb-panel" data-panel="milestone" hidden></div>').append(milestones_section(ctx.detail.milestones || [])));
    panels.append($('<div class="vb-panel" data-panel="tim" hidden></div>').append(team_section(ctx.detail.team_members || [])));
    panels.append($('<div class="vb-panel" data-panel="ringkasan" hidden></div>').append(open_tasks_section(ctx.detail.open_tasks || [])));
    ctx.root.append(panels);
}

const TABS = [["kanban", "Kanban"], ["milestone", "Milestone"], ["tim", "Tim"], ["ringkasan", "Ringkasan"]];

function tabs_bar() {
    const bar = $('<div class="vb-tabs"></div>');
    TABS.forEach(([key, label], i) => {
        const t = $(`<button class="vb-tab${i === 0 ? " vb-tab-active" : ""}" data-tab="${key}">${label}</button>`);
        t.on("click", () => switch_tab(bar, key));
        bar.append(t);
    });
    return bar;
}

function switch_tab(bar, key) {
    bar.find(".vb-tab").removeClass("vb-tab-active");
    bar.find(`[data-tab="${key}"]`).addClass("vb-tab-active");
    const root = bar.closest(".vt-detail");
    root.find(".vb-panel").attr("hidden", true);
    root.find(`[data-panel="${key}"]`).removeAttr("hidden");
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
        <div class="vb-quickadd" hidden><input class="vb-quickadd-input" type="text" placeholder="Judul task, Enter…" /></div>
        <div class="vb-col-body"></div></div>`);
    const body = el.find(".vb-col-body");
    (col.tasks || []).forEach((t) => body.append(card_el(t, ctx)));
    if (can_add) wire_quickadd(el, col.key, ctx);
    init_sortable(body.get(0), ctx);
    return el;
}

function card_el(task, ctx) {
    const locked = (task.allowed_targets || []).length === 0;
    const card = $(`<div class="vb-card${locked ? " vb-locked" : ""}" data-id="${esc(task.id)}"
        data-allowed='${JSON.stringify(task.allowed_targets || [])}'>
        <div class="vb-card-title">${esc(task.title || task.id)}
            ${task.risk_flag ? '<span class="vh-chip vh-chip-behind">Risiko</span>' : ""}</div>
        <div class="vb-card-meta"></div></div>`);
    card.find(".vb-card-meta").append(priority_select(task, ctx), assignee_select(task, ctx), deadline_input(task));
    return card;
}

function priority_select(task, ctx) {
    const sel = $('<select class="vb-edit vb-prio" data-field="priority"></select>');
    (ctx.board.priorities || []).forEach((p) => sel.append(`<option value="${esc(p)}"${p === task.priority ? " selected" : ""}>${esc(p)}</option>`));
    return sel;
}

function assignee_select(task, ctx) {
    const sel = $('<select class="vb-edit vb-assignee" data-field="assigned_to"></select>');
    sel.append('<option value="">— assignee —</option>');
    (ctx.board.team || []).forEach((m) => sel.append(`<option value="${esc(m.user)}"${m.user === task.assigned_to ? " selected" : ""}>${esc(m.full_name)}</option>`));
    return sel;
}

function deadline_input(task) {
    return $(`<input class="vb-edit vb-deadline" type="date" data-field="deadline" value="${esc(task.deadline || "")}" />`);
}

// ── interactions ───────────────────────────────────────────────────────────

function init_sortable(body_el, ctx) {
    if (!window.Sortable || !body_el) return;
    new Sortable(body_el, {
        group: SORTABLE_GROUP,
        draggable: ".vb-card:not(.vb-locked)",
        filter: ".vb-edit",
        preventOnFilter: false,
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

function wire_quickadd(col_el, col_key, ctx) {
    const wrap = col_el.find(".vb-quickadd");
    const input = wrap.find(".vb-quickadd-input");
    col_el.find(".vb-add").on("click", () => { wrap.removeAttr("hidden"); input.focus(); });
    input.on("keydown", (e) => {
        if (e.key === "Escape") return wrap.attr("hidden", true);
        if (e.key !== "Enter" || !input.val().trim()) return;
        frappe.call(CREATE_API, { project_id: ctx.project_id, title: input.val().trim(), column: col_key })
            .then(() => reload_board(ctx));
    });
}

function bind_card_events(ctx) {
    ctx.root.on("change", ".vb-edit", function () {
        const card = this.closest(".vb-card");
        frappe.call(PATCH_API, { task_id: card.dataset.id, field: this.dataset.field, value: this.value })
            .then(() => reload_board(ctx))
            .catch(() => reload_board(ctx));
    });
    ctx.root.on("click", ".vb-card-title", function () {
        frappe.set_route("Form", "VT Task", this.closest(".vb-card").dataset.id);
    });
}

function reload_board(ctx) {
    frappe.call(BOARD_API, { project_id: ctx.project_id }).then((r) => {
        ctx.board = (r && r.message) || { columns: [], team: [], priorities: [] };
        ctx.root.find('[data-panel="kanban"]').empty().append(kanban_body(ctx));
    });
}

// ── hero + non-kanban sections (reused) ─────────────────────────────────────

function risk_chip(risk) {
    return `<span class="vh-chip vh-chip-${risk}">${esc(PROJ_RISK_LABELS[risk] || risk)}</span>`;
}

function hero_meta(h) {
    const parts = [];
    if (h.leader) parts.push(esc(h.leader));
    if (h.start_date || h.end_date) parts.push(`${h.start_date || "?"}–${h.end_date || "?"}`);
    if (h.pdca_phase) parts.push(esc(h.pdca_phase));
    return parts.join(" · ");
}

function hero_card(h) {
    const pct = h.percent_done || 0;
    return $(`<div class="vh-card vb-hero">
        <div class="vb-hero-top">
            <strong>${esc(h.title || h.id)}</strong>
            <span class="vb-hero-chips"><span class="vh-chip">${esc(h.status)}</span>${risk_chip(h.risk)}</span></div>
        <div class="vh-bar vb-hero-bar"><span style="width:${pct}%"></span></div>
        <div class="vh-item-meta">${hero_meta(h)}</div></div>`);
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
