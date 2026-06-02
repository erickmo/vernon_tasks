/* vt_scorecard.js — personal gamification scorecard.
   Shows: monthly net-points bar chart + paginated transaction log.
   API: task/page/vt_scorecard/vt_scorecard.py */

const SC_API_LOG     = "vernon_tasks.task.page.vt_scorecard.vt_scorecard.get_point_log";
const SC_API_SUMMARY = "vernon_tasks.task.page.vt_scorecard.vt_scorecard.get_monthly_summary";
const SC_PAGE_SIZE   = 30;
const TYPE_COLOR = {
    earned:            "var(--green-500)",
    early_bonus:       "var(--blue-500)",
    late_penalty:      "var(--red-400)",
    revision_deduction:"var(--orange-500)",
    leader_override:   "var(--purple-500)",
};

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

frappe.pages["vt-scorecard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Scorecard & Poin"),
        single_column: true,
    });

    const state = { offset: 0, project: null };

    const project_field = page.add_field({
        fieldname: "project",
        label: __("Proyek"),
        fieldtype: "Link",
        options: "VT Project",
        change: () => {
            state.project = project_field.get_value() || null;
            state.offset = 0;
            render_all();
        },
    });

    page.add_button(__("Refresh"), () => { state.offset = 0; render_all(); }, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px 0;"></div>').appendTo(page.main);

    function call(method, args) {
        return frappe.call({ method, args })
            .then((r) => r.message || [])
            .catch(() => {
                frappe.show_alert({ message: __("Gagal memuat data"), indicator: "red" });
                return [];
            });
    }

    function render_summary() {
        call(SC_API_SUMMARY, { months: 6 }).then((rows) => {
            const section = $('<div class="vh-section" style="margin-bottom:24px;"></div>');
            section.append('<div class="vh-section-title">Poin Bulanan (6 bulan terakhir)</div>');

            if (!rows.length) {
                section.append('<div class="vh-empty">Belum ada ringkasan poin.</div>');
                container.prepend(section);
                return;
            }

            const chart_el = $('<div id="sc-monthly-chart"></div>');
            section.append(chart_el);
            container.prepend(section);

            new frappe.Chart("#sc-monthly-chart", {
                type: "bar",
                data: {
                    labels: rows.map((r) => esc(r.period)),
                    datasets: [
                        { name: __("Net Poin"), values: rows.map((r) => r.net_points || 0) },
                    ],
                },
                colors: ["#6366f1"],
                height: 200,
            });
        });
    }

    function render_log() {
        const args = { limit: SC_PAGE_SIZE, offset: state.offset };
        if (state.project) args.project = state.project;

        call(SC_API_LOG, args).then((rows) => {
            const log_section = $('<div class="vh-section"></div>');
            log_section.append('<div class="vh-section-title">Riwayat Transaksi Poin</div>');

            if (!rows.length) {
                log_section.append('<div class="vh-empty">Belum ada transaksi poin.</div>');
            } else {
                const table = $(`
                    <table class="table table-sm" style="font-size:13px;">
                        <thead>
                            <tr>
                                <th>Tugas</th>
                                <th>Tipe</th>
                                <th style="text-align:right;">Poin</th>
                                <th>Catatan</th>
                                <th>Waktu</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                `);
                const tbody = table.find("tbody");
                rows.forEach((r) => {
                    const color = TYPE_COLOR[r.transaction_type] || "inherit";
                    const sign  = (r.transaction_type === "earned" || r.transaction_type === "early_bonus") ? "+" : "−";
                    tbody.append(`
                        <tr>
                            <td>${esc(r.task_title)}</td>
                            <td>${esc(r.transaction_type)}</td>
                            <td style="text-align:right;color:${color};font-weight:600;">
                                ${sign}${Math.abs(r.amount).toFixed(1)}
                            </td>
                            <td>${esc(r.note || "—")}</td>
                            <td style="color:var(--text-muted);font-size:12px;">
                                ${esc(frappe.datetime.str_to_user(r.log_timestamp))}
                            </td>
                        </tr>
                    `);
                });
                log_section.append(table);

                const nav = $('<div style="display:flex;gap:8px;margin-top:8px;"></div>');
                if (state.offset > 0) {
                    nav.append($(`<button class="btn btn-xs btn-default">${__("← Sebelumnya")}</button>`)
                        .on("click", () => { state.offset = Math.max(0, state.offset - SC_PAGE_SIZE); render_log(); }));
                }
                if (rows.length === SC_PAGE_SIZE) {
                    nav.append($(`<button class="btn btn-xs btn-default">${__("Berikutnya →")}</button>`)
                        .on("click", () => { state.offset += SC_PAGE_SIZE; render_log(); }));
                }
                log_section.append(nav);
            }

            container.find(".sc-log-section").remove();
            log_section.addClass("sc-log-section");
            container.append(log_section);
        });
    }

    function render_all() {
        container.empty();
        render_summary();
        render_log();
    }

    render_all();
};
