frappe.pages["leader-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Dashboard",
        single_column: true,
    });

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });

    const container = $('<div class="leader-dashboard-container" style="padding: 0 20px 40px;"></div>')
        .appendTo(page.main);

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        return frappe.datetime.str_to_user(d);
    }

    // ── Number cards ──────────────────────────────────────────────────────────

    const cards_row = $('<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:20px;"></div>')
        .appendTo(container);

    function make_card(id, label, color) {
        $(`
            <div class="frappe-card" style="flex:1; min-width:160px; padding:20px; text-align:center;">
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">${label}</div>
                <div id="${id}" style="font-size:28px; font-weight:700; color:var(--${color}-500);">—</div>
            </div>
        `).appendTo(cards_row);
    }

    make_card("ld-pending", "Pending Review", "orange");
    make_card("ld-approval", "Approval Rate %", "green");
    make_card("ld-points", "Team Points (Month)", "blue");

    function render_stats() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_leader_stats",
            callback(r) {
                const d = r.message || {};
                $("#ld-pending").text(d.pending_review ?? 0);
                $("#ld-approval").text(
                    typeof d.approval_rate === "number" ? d.approval_rate.toFixed(1) + "%" : "—"
                );
                $("#ld-points").text(
                    typeof d.team_points_month === "number" ? d.team_points_month.toFixed(1) : "0"
                );
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load stats", indicator: "red" }); },
        });
    }

    // ── Charts row ────────────────────────────────────────────────────────────

    const charts_row = $('<div style="display:flex; gap:16px; margin-top:20px; flex-wrap:wrap;"></div>')
        .appendTo(container);

    $(`
        <div class="frappe-card" style="flex:1; min-width:220px; padding:16px;">
            <h5 style="margin:0 0 12px;">PDCA Phase Distribution</h5>
            <div id="ld-donut-chart"></div>
        </div>
    `).appendTo(charts_row);

    $(`
        <div class="frappe-card" style="flex:2; min-width:300px; padding:16px;">
            <h5 style="margin:0 0 12px;">Team Points Leaderboard (This Month)</h5>
            <div id="ld-bar-chart"></div>
        </div>
    `).appendTo(charts_row);

    const PHASE_COLORS = {
        BACKLOG: "#b0bec5", PLAN: "#5e64ff", DO: "#ff9800",
        CHECK: "#7c4dff", ACT: "#00bcd4", DONE: "#4caf50",
    };

    let donut_chart = null;
    let bar_chart = null;

    function render_donut_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_phase_distribution",
            callback(r) {
                const data = r.message || [];
                if (!data.length) {
                    donut_chart = null;
                    $("#ld-donut-chart").html('<p class="text-muted" style="padding:12px 0;">No tasks found.</p>');
                    return;
                }
                const labels = data.map(d => d.phase);
                const values = data.map(d => d.count);
                const colors = labels.map(p => PHASE_COLORS[p] || "#9e9e9e");
                const chart_data = { labels, datasets: [{ values }] };

                if (donut_chart) {
                    donut_chart.update(chart_data);
                } else {
                    donut_chart = new frappe.Chart("#ld-donut-chart", {
                        type: "donut",
                        height: 200,
                        colors,
                        data: chart_data,
                    });
                }
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load chart", indicator: "red" }); },
        });
    }

    function render_bar_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_team_leaderboard",
            callback(r) {
                const data = r.message || [];
                if (!data.length) {
                    bar_chart = null;
                    $("#ld-bar-chart").html('<p class="text-muted" style="padding:12px 0;">No data this month.</p>');
                    return;
                }
                const labels = data.map(d => d.member ? d.member.split("@")[0] : "Unassigned");
                const values = data.map(d => d.points);
                const chart_data = { labels, datasets: [{ values }] };

                if (bar_chart) {
                    bar_chart.update(chart_data);
                } else {
                    bar_chart = new frappe.Chart("#ld-bar-chart", {
                        type: "bar",
                        height: 200,
                        colors: ["#5e64ff"],
                        data: chart_data,
                        tooltipOptions: { formatTooltipY: d => (d || 0).toFixed(1) + " pts" },
                    });
                }
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load leaderboard", indicator: "red" }); },
        });
    }

    // ── Overdue tasks table ───────────────────────────────────────────────────

    $(`
        <div class="frappe-card" style="margin-top:20px; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h5 style="margin:0;">Overdue Tasks <span class="badge badge-secondary" id="ld-overdue-count">0</span></h5>
            </div>
            <div id="ld-overdue-body"></div>
        </div>
    `).appendTo(container);

    function render_overdue_table() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_overdue_tasks",
            callback(r) {
                const data = r.message || [];
                $("#ld-overdue-count").text(data.length);
                if (!data.length) {
                    $("#ld-overdue-body").html('<p class="text-muted" style="padding:12px 0;">No overdue tasks.</p>');
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${esc(t.member)}</td>
                        <td><a href="/app/vt-task/${esc(t.task_name)}" target="_blank">${esc(t.task_title)}</a></td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td><span style="color:var(--red-500); font-weight:600;">${t.days_overdue ?? 0}d</span></td>
                        <td>${esc(t.phase)}</td>
                    </tr>
                `).join("");
                $("#ld-overdue-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Member</th><th>Task</th><th>Deadline</th>
                            <th>Days Overdue</th><th>Phase</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load overdue tasks", indicator: "red" }); },
        });
    }

    // ── Render all ────────────────────────────────────────────────────────────

    function render_all() {
        render_stats();
        render_donut_chart();
        render_bar_chart();
        render_overdue_table();
    }

    render_all();
};
