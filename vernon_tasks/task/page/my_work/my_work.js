frappe.pages["my-work"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Work",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
        { label: "My Dashboard", route: "my-dashboard", icon: "bar-chart" },
    ]);

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });

    const container = $('<div class="my-work-container" style="padding: 0 20px 40px 0;"></div>')
        .appendTo(page.main);

    // ── helpers ──────────────────────────────────────────────────────────────

    const PRIORITY_COLOR = { High: "red", Medium: "orange", Low: "blue" };
    const KANBAN_COLOR = {
        "Backlog": "gray", "Scheduled": "blue", "In Progress": "yellow",
        "In Review": "purple", "Revision": "orange", "Done": "green",
    };

    function status_pill(label) {
        const color = KANBAN_COLOR[label] || "gray";
        return `<span class="indicator-pill ${color}">${label}</span>`;
    }

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        if (diff === 0) return `<span style="color:var(--orange-500)">Today</span>`;
        return `+${diff}d`;
    }

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function task_link(name, title) {
        return `<a href="/app/vt-task/${esc(name)}" target="_blank">${esc(title)}</a>`;
    }

    function make_section(id, title) {
        $(`
            <div class="frappe-card" style="margin-top:20px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h5 style="margin:0;">${title} <span class="badge badge-secondary" id="${id}-count">0</span></h5>
                </div>
                <div id="${id}-body"></div>
            </div>
        `).appendTo(container);
    }

    function empty_state(msg) {
        return `<p class="text-muted" style="padding:12px 0;">${msg}</p>`;
    }

    function action_btn(task_name, kanban_status) {
        if (["Backlog", "Scheduled"].includes(kanban_status)) {
            return `<button class="btn btn-xs btn-primary btn-start" data-task="${task_name}">Start</button>`;
        }
        if (kanban_status === "In Progress") {
            return `<button class="btn btn-xs btn-warning btn-submit" data-task="${task_name}">Submit for Review</button>`;
        }
        return "—";
    }

    // ── My Day section ────────────────────────────────────────────────────────

    make_section("my-day", "My Day");

    function render_my_day() {
        frappe.call({
            method: "vernon_tasks.task.page.my_work.my_work.get_my_day",
            callback(r) {
                const data = r.message || [];
                $("#my-day-count").text(data.length);
                if (!data.length) {
                    $("#my-day-body").html(empty_state("No tasks scheduled today."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${t.allocated_minutes ? t.allocated_minutes + "m" : "—"}</td>
                        <td>${status_pill(t.kanban_status)}</td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>
                `).join("");
                $("#my-day-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Task</th><th>Project</th><th>Hours</th>
                            <th>Status</th><th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── What To Do Today section ──────────────────────────────────────────────

    make_section("wtdt", "What To Do Today");

    function render_what_to_do_today() {
        frappe.call({
            method: "vernon_tasks.task.page.my_work.my_work.get_what_to_do_today",
            callback(r) {
                const data = r.message || [];
                $("#wtdt-count").text(data.length);
                if (!data.length) {
                    $("#wtdt-body").html(empty_state("Nothing due soon."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td><span class="indicator-pill ${PRIORITY_COLOR[t.priority] || "gray"}">${esc(t.priority)}</span></td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>
                `).join("");
                $("#wtdt-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Task</th><th>Project</th><th>Deadline</th>
                            <th>Priority</th><th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── My Blocked Tasks section ──────────────────────────────────────────────

    make_section("blocked", "My Blocked Tasks");

    function render_blocked() {
        frappe.call({
            method: "vernon_tasks.task.page.my_work.my_work.get_my_blocked_tasks",
            callback(r) {
                const data = r.message || [];
                $("#blocked-count").text(data.length);
                if (!data.length) {
                    $("#blocked-body").html(empty_state("No blocked tasks."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${task_link(t.blocker_name, t.blocker_title)}</td>
                        <td>${esc(t.blocker_assignee) || "—"}</td>
                        <td>${t.days_blocked || 0}d</td>
                    </tr>
                `).join("");
                $("#blocked-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Task</th><th>Blocked By</th><th>Assignee</th><th>Days</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Action handlers ───────────────────────────────────────────────────────

    function call_action(method, task_name) {
        frappe.call({
            method,
            args: { task: task_name },
            callback(r) {
                if (r.message && r.message.status === "ok") {
                    frappe.show_alert({ message: "Done", indicator: "green" });
                    render_all();
                }
            },
            error(r) {
                frappe.msgprint(r.message || "Action failed");
            },
        });
    }

    $(document).on("click", ".btn-start", function () {
        const task = $(this).data("task");
        call_action("vernon_tasks.task.page.my_work.my_work.start_task", task);
    });

    $(document).on("click", ".btn-submit", function () {
        const task = $(this).data("task");
        call_action("vernon_tasks.task.page.my_work.my_work.submit_for_review", task);
    });

    // ── Initial render ────────────────────────────────────────────────────────

    function render_all() {
        render_my_day();
        render_what_to_do_today();
        render_blocked();
    }

    render_all();
};
