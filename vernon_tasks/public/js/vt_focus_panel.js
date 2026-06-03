/* vt_focus_panel.js — shared "Tugas Saya" focus panel for vt-home.
   Exposes window.vt_render_focus_panel(wrapper): renders My Day /
   What To Do Today / My Blocked Tasks with Start / Submit-for-Review
   actions into the given jQuery element. Presentation only — calls
   whitelisted APIs in vernon_tasks.task.api.my_work. Extracted from the
   retired my-work desk Page so vt_home.js stays lean. */
(function () {
    const MW_API = "vernon_tasks.task.api.my_work";

    const PRIORITY_COLOR = { High: "red", Medium: "orange", Low: "blue" };
    const KANBAN_COLOR = {
        "Backlog": "gray", "Scheduled": "blue", "In Progress": "yellow",
        "In Review": "purple", "Revision": "orange", "Done": "green",
    };

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function status_pill(label) {
        const color = KANBAN_COLOR[label] || "gray";
        return `<span class="indicator-pill ${color}">${esc(label)}</span>`;
    }

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        if (diff === 0) return `<span style="color:var(--orange-500)">Today</span>`;
        return `+${diff}d`;
    }

    function task_link(name, title) {
        return `<a href="/app/vt-task/${esc(name)}" target="_blank">${esc(title)}</a>`;
    }

    function make_section(container, id, title) {
        $(`
            <div class="frappe-card" style="margin-top:20px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h5 style="margin:0;">${esc(title)} <span class="badge badge-secondary" id="${id}-count">0</span></h5>
                </div>
                <div id="${id}-body"></div>
            </div>
        `).appendTo(container);
    }

    function empty_state(msg) {
        return `<p class="text-muted" style="padding:12px 0;">${esc(msg)}</p>`;
    }

    function action_btn(task_name, kanban_status) {
        if (["Backlog", "Scheduled"].includes(kanban_status)) {
            return `<button class="btn btn-xs btn-primary btn-start" data-task="${esc(task_name)}">Start</button>`;
        }
        if (kanban_status === "In Progress") {
            return `<button class="btn btn-xs btn-warning btn-submit" data-task="${esc(task_name)}">Submit for Review</button>`;
        }
        return "—";
    }

    function render_my_day(root) {
        frappe.call({
            method: `${MW_API}.get_my_day`,
            callback(r) {
                const data = r.message || [];
                root.find("#my-day-count").text(data.length);
                if (!data.length) {
                    root.find("#my-day-body").html(empty_state("No tasks scheduled today."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${t.allocated_minutes ? t.allocated_minutes + "m" : "—"}</td>
                        <td>${status_pill(t.kanban_status)}</td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>`).join("");
                root.find("#my-day-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Project</th><th>Hours</th><th>Status</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function render_what_to_do_today(root) {
        frappe.call({
            method: `${MW_API}.get_what_to_do_today`,
            callback(r) {
                const data = r.message || [];
                root.find("#wtdt-count").text(data.length);
                if (!data.length) {
                    root.find("#wtdt-body").html(empty_state("Nothing due soon."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td><span class="indicator-pill ${PRIORITY_COLOR[t.priority] || "gray"}">${esc(t.priority)}</span></td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>`).join("");
                root.find("#wtdt-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Project</th><th>Deadline</th><th>Priority</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function render_blocked(root) {
        frappe.call({
            method: `${MW_API}.get_my_blocked_tasks`,
            callback(r) {
                const data = r.message || [];
                root.find("#blocked-count").text(data.length);
                if (!data.length) {
                    root.find("#blocked-body").html(empty_state("No blocked tasks."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${task_link(t.blocker_name, t.blocker_title)}</td>
                        <td>${esc(t.blocker_assignee) || "—"}</td>
                        <td>${t.days_blocked || 0}d</td>
                    </tr>`).join("");
                root.find("#blocked-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Blocked By</th><th>Assignee</th><th>Days</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function call_action(root, method, task_name) {
        frappe.call({
            method,
            args: { task: task_name },
            callback(r) {
                if (r.message && r.message.status === "ok") {
                    frappe.show_alert({ message: "Done", indicator: "green" });
                    render_focus(root);
                }
            },
            error(r) {
                frappe.msgprint((r && r.message) || "Action failed");
            },
        });
    }

    function bind_actions(root) {
        root.off("click.vtfocus");
        root.on("click.vtfocus", ".btn-start", function () {
            call_action(root, `${MW_API}.start_task`, $(this).data("task"));
        });
        root.on("click.vtfocus", ".btn-submit", function () {
            call_action(root, `${MW_API}.submit_for_review`, $(this).data("task"));
        });
    }

    function render_focus(root) {
        root.empty();
        const container = $('<div class="my-work-container" style="padding: 0 20px 40px 0;"></div>').appendTo(root);
        make_section(container, "my-day", "My Day");
        make_section(container, "wtdt", "What To Do Today");
        make_section(container, "blocked", "My Blocked Tasks");
        render_my_day(container);
        render_what_to_do_today(container);
        render_blocked(container);
        bind_actions(container);
    }

    // Public entry point: render the focus panel into `wrapper` (DOM node or jQuery).
    window.vt_render_focus_panel = function (wrapper) {
        render_focus($(wrapper));
    };
})();
