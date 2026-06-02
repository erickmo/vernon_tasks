frappe.pages["my-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Dashboard",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Work", route: "my-work", icon: "book-open" },
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
    ]);

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });

    const container = $('<div class="my-dashboard-container" style="padding: 0 20px 40px 0;"></div>')
        .appendTo(page.main);

    // ── Number cards ──────────────────────────────────────────────────────────

    const cards_row = $('<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:20px;"></div>')
        .appendTo(container);

    function make_card(id, label, color) {
        const card = $(`
            <div class="frappe-card" style="flex:1; min-width:160px; padding:20px; text-align:center;">
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">${label}</div>
                <div id="${id}" style="font-size:28px; font-weight:700; color:var(--${color}-500);">—</div>
            </div>
        `).appendTo(cards_row);
    }

    make_card("md-done-today", "Done Today", "green");
    make_card("md-done-week", "Done This Week", "blue");
    make_card("md-points-month", "Points This Month", "orange");
    make_card("md-blocked", "Blocked Tasks", "red");

    function render_stats() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats",
            callback(r) {
                const d = r.message || {};
                $("#md-done-today").text(d.done_today ?? 0);
                $("#md-done-week").text(d.done_week ?? 0);
                $("#md-points-month").text(
                    typeof d.points_month === "number" ? d.points_month.toFixed(1) : "0"
                );
                $("#md-blocked").text(d.blocked ?? 0);
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load data", indicator: "red" }); },
        });
    }

    // ── Charts row ────────────────────────────────────────────────────────────

    const charts_row = $('<div style="display:flex; gap:16px; margin-top:20px; flex-wrap:wrap;"></div>')
        .appendTo(container);

    $(`
        <div class="frappe-card" style="flex:2; min-width:300px; padding:16px;">
            <h5 style="margin:0 0 12px;">Tasks Completed — Last 7 Days</h5>
            <div id="md-bar-chart"></div>
        </div>
    `).appendTo(charts_row);

    $(`
        <div class="frappe-card" style="flex:1; min-width:220px; padding:16px;">
            <h5 style="margin:0 0 12px;">Hours: Logged vs Remaining</h5>
            <div id="md-donut-chart"></div>
        </div>
    `).appendTo(charts_row);

    let bar_chart = null;
    let donut_chart = null;

    function render_bar_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_daily_completions",
            callback(r) {
                const data = r.message || [];
                const labels = data.map(d => frappe.datetime.str_to_user(d.date));
                const values = data.map(d => d.count);

                if (bar_chart) {
                    bar_chart.update({ labels, datasets: [{ values }] });
                } else {
                    bar_chart = new frappe.Chart("#md-bar-chart", {
                        type: "bar",
                        height: 180,
                        colors: ["#5e64ff"],
                        data: { labels, datasets: [{ values }] },
                        tooltipOptions: { formatTooltipY: d => (d ?? 0) + " tasks" },
                    });
                }
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load data", indicator: "red" }); },
        });
    }

    function render_donut_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_hours_summary",
            callback(r) {
                const d = r.message || { actual_minutes: 0, estimated_minutes: 0 };
                const remaining = Math.max(0, d.estimated_minutes - d.actual_minutes);

                if (d.actual_minutes === 0 && remaining === 0) {
                    donut_chart = null;
                    $("#md-donut-chart").html(
                        '<p class="text-muted" style="padding:12px 0;">No active tasks.</p>'
                    );
                    return;
                }

                const chart_data = {
                    labels: ["Logged", "Remaining"],
                    datasets: [{ values: [d.actual_minutes, remaining] }],
                };

                if (donut_chart) {
                    donut_chart.update(chart_data);
                } else {
                    donut_chart = new frappe.Chart("#md-donut-chart", {
                        type: "donut",
                        height: 180,
                        colors: ["#5e64ff", "#e0e0e0"],
                        data: chart_data,
                        tooltipOptions: { formatTooltipY: d => d.toFixed(1) + "m" },
                    });
                }
            },
            error(r) { frappe.show_alert({ message: r.message || "Failed to load data", indicator: "red" }); },
        });
    }

    // ── Render all ────────────────────────────────────────────────────────────

    function render_all() {
        render_stats();
        render_bar_chart();
        render_donut_chart();
    }

    render_all();
};
