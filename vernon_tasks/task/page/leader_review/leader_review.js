frappe.pages["leader-review"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Review",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
        { label: "Leader Dashboard", route: "leader-dashboard", icon: "bar-chart" },
    ]);

    page.add_button(__("Refresh"), () => render_active_tab(), { icon: "refresh" });

    const container = $('<div class="lr-container" style="padding: 0 20px 40px 0;"></div>')
        .appendTo(page.main);

    // ── helpers ──────────────────────────────────────────────────────────────

    const PRIORITY_COLOR = { Critical: "red", High: "red", Medium: "orange", Low: "blue" };
    const KANBAN_COLOR = {
        "Backlog": "gray", "Scheduled": "blue", "In Progress": "yellow",
        "In Review": "purple", "Revision": "orange", "Done": "green",
    };

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function task_link(name, title) {
        return `<a href="/app/vt-task/${esc(name)}" target="_blank">${esc(title)}</a>`;
    }

    function status_pill(label) {
        return `<span class="indicator-pill ${KANBAN_COLOR[label] || "gray"}">${esc(label)}</span>`;
    }

    function priority_pill(p) {
        return `<span class="indicator-pill ${PRIORITY_COLOR[p] || "gray"}">${esc(p)}</span>`;
    }

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        if (diff === 0) return `<span style="color:var(--orange-500)">Today</span>`;
        return `+${diff}d`;
    }

    function empty_state(msg) {
        return `<p class="text-muted" style="padding:12px 0;">${esc(msg)}</p>`;
    }

    function workload_bar(hours, capacity) {
        const pct = Math.min(100, Math.round((hours / capacity) * 100));
        const color = pct >= 100 ? "var(--red-500)" : pct >= 80 ? "var(--orange-500)" : "var(--green-500)";
        return `
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="flex:1; background:var(--gray-200); border-radius:4px; height:8px;">
                    <div style="width:${pct}%; background:${color}; border-radius:4px; height:8px;"></div>
                </div>
                <span style="font-size:11px; color:${color};">${hours.toFixed(1)}h / ${capacity}h${pct >= 100 ? " ⚠" : ""}</span>
            </div>`;
    }

    // ── tabs ─────────────────────────────────────────────────────────────────

    const TABS = [
        { id: "review-queue", label: "Review Queue" },
        { id: "team-workload", label: "Team Workload" },
        { id: "team-blocked", label: "Blocked Tasks" },
    ];

    let activeTab = "review-queue";

    const tabNav = $('<ul class="nav nav-tabs" style="margin: 16px 0 0;"></ul>').appendTo(container);
    const tabContent = $('<div class="tab-content" style="margin-top:0;"></div>').appendTo(container);

    TABS.forEach(({ id, label }) => {
        $(`<li class="nav-item">
            <a class="nav-link${id === activeTab ? " active" : ""}" data-tab="${id}" href="#">
                ${esc(label)} <span class="badge badge-secondary" id="${id}-count" style="margin-left:4px;">0</span>
            </a>
        </li>`).appendTo(tabNav);

        $(`<div class="tab-pane frappe-card" id="${id}-pane"
            style="padding:16px; display:${id === activeTab ? "block" : "none"}; margin-top:0; border-top:none; border-radius:0 0 4px 4px;">
            <div id="${id}-body"></div>
        </div>`).appendTo(tabContent);
    });

    tabNav.on("click", ".nav-link", function (e) {
        e.preventDefault();
        activeTab = $(this).data("tab");
        tabNav.find(".nav-link").removeClass("active");
        $(this).addClass("active");
        tabContent.find(".tab-pane").hide();
        $(`#${activeTab}-pane`).show();
        render_active_tab();
    });

    // ── Tab 1: Review Queue ───────────────────────────────────────────────────

    function render_review_queue() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_review_queue",
            callback(r) {
                const data = r.message || [];
                $("#review-queue-count").text(data.length);
                if (!data.length) {
                    $("#review-queue-body").html(empty_state("No tasks pending review."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${esc(t.assigned_to) || "—"}</td>
                        <td>${priority_pill(t.priority)}</td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-xs btn-success btn-approve" data-task="${esc(t.name)}">Approve</button>
                            <button class="btn btn-xs btn-danger btn-reject" data-task="${esc(t.name)}" style="margin-left:4px;">Reject</button>
                        </td>
                    </tr>
                `).join("");
                $("#review-queue-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Task</th><th>Project</th><th>Assignee</th>
                            <th>Priority</th><th>Deadline</th><th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Tab 2: Team Workload ──────────────────────────────────────────────────

    function render_team_workload() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_team_workload",
            callback(r) {
                const data = r.message || [];
                $("#team-workload-count").text(data.length);
                if (!data.length) {
                    $("#team-workload-body").html(empty_state("No active team members."));
                    return;
                }
                const rows = data.map(m => `
                    <tr>
                        <td>${esc(m.assigned_to)}</td>
                        <td>${workload_bar(m.total_hours, m.capacity)}</td>
                    </tr>
                `).join("");
                $("#team-workload-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Member</th><th>Load</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Tab 3: Blocked Tasks ──────────────────────────────────────────────────

    function render_team_blocked() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_team_blocked_tasks",
            callback(r) {
                const data = r.message || [];
                $("#team-blocked-count").text(data.length);
                if (!data.length) {
                    $("#team-blocked-body").html(empty_state("No blocked tasks."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.assigned_to) || "—"}</td>
                        <td>${task_link(t.blocker_name, t.blocker_title)}</td>
                        <td>${esc(t.blocker_assignee) || "—"}</td>
                        <td>${t.days_blocked || 0}d</td>
                    </tr>
                `).join("");
                $("#team-blocked-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Blocked Task</th><th>Member</th>
                            <th>Blocked By</th><th>Blocker Owner</th><th>Days</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Action handlers ───────────────────────────────────────────────────────

    $(document).on("click", ".btn-approve", function () {
        const task_name = $(this).data("task");
        frappe.confirm(
            `Approve task <b>${esc(task_name)}</b>? This will mark it as DONE and calculate points.`,
            () => {
                frappe.call({
                    method: "vernon_tasks.task.page.leader_review.leader_review.approve_task",
                    args: { task_name },
                    callback(r) {
                        if (r.message && r.message.status === "ok") {
                            frappe.show_alert({ message: "Task approved", indicator: "green" });
                            render_review_queue();
                        }
                    },
                    error(r) {
                        frappe.msgprint(r.message || "Approval failed");
                    },
                });
            }
        );
    });

    $(document).on("click", ".btn-reject", function () {
        const task_name = $(this).data("task");
        frappe.prompt(
            {
                label: "Rejection Reason",
                fieldname: "reason",
                fieldtype: "Small Text",
                reqd: 1,
            },
            ({ reason }) => {
                frappe.call({
                    method: "vernon_tasks.task.page.leader_review.leader_review.reject_task",
                    args: { task_name, reason },
                    callback(r) {
                        if (r.message && r.message.status === "ok") {
                            frappe.show_alert({ message: "Task sent back for revision", indicator: "orange" });
                            render_review_queue();
                        }
                    },
                    error(r) {
                        frappe.msgprint(r.message || "Rejection failed");
                    },
                });
            },
            "Reject Task",
            "Reject"
        );
    });

    // ── Routing ───────────────────────────────────────────────────────────────

    function render_active_tab() {
        if (activeTab === "review-queue") render_review_queue();
        else if (activeTab === "team-workload") render_team_workload();
        else if (activeTab === "team-blocked") render_team_blocked();
    }

    render_review_queue();
};
