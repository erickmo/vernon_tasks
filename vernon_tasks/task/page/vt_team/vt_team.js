/* vt_team.js — Team Capacity page for Leaders and Managers.
   Shows per-member utilization bar, active task count, and expandable task list.
   API: task/page/vt_team/vt_team.py */

const TEAM_API = "vernon_tasks.task.page.vt_team.vt_team.get_team_capacity";

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

function utilization_color(pct) {
    if (pct >= 100) return "var(--red-500)";
    if (pct >= 75)  return "var(--orange-500)";
    if (pct >= 40)  return "var(--green-500)";
    return "var(--text-muted)";
}

frappe.pages["vt-team"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Tim & Kapasitas"),
        single_column: true,
    });

    const state = { project: null };

    const project_field = page.add_field({
        fieldname: "project",
        label: __("Proyek"),
        fieldtype: "Link",
        options: "VT Project",
        change: () => { state.project = project_field.get_value() || null; render(); },
    });

    page.add_button(__("Refresh"), render, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px;"></div>').appendTo(page.main);

    function build_utilization_bar(pct) {
        const color = utilization_color(pct);
        const safe_pct = Math.min(100, pct || 0);
        return `
            <div style="display:flex;align-items:center;gap:8px;min-width:160px;">
                <div style="flex:1;background:var(--border-color);border-radius:4px;height:8px;">
                    <div style="width:${safe_pct.toFixed(1)}%;height:8px;border-radius:4px;background:${color};"></div>
                </div>
                <span style="font-size:12px;font-weight:600;color:${color};min-width:44px;">
                    ${pct.toFixed(0)}%
                </span>
            </div>
        `;
    }

    function build_task_list(tasks) {
        if (!tasks.length) {
            return `<div style="padding:8px 16px;font-size:13px;color:var(--text-muted);">${__("Tidak ada tugas aktif")}</div>`;
        }
        return tasks.map((t) => `
            <div style="padding:5px 16px;font-size:12px;border-bottom:1px solid var(--border-color);
                 display:flex;justify-content:space-between;align-items:center;">
                <span>${esc(t.title)}</span>
                <span style="color:var(--text-muted);">
                    ${esc(t.estimated_minutes ? (Math.round(t.estimated_minutes / 60 * 10) / 10) + " jam" : "—")}
                    · ${esc(t.kanban_status)}
                </span>
            </div>
        `).join("");
    }

    function build_member_card(member) {
        const card = $(`
            <div style="border:1px solid var(--border-color);border-radius:8px;
                 margin-bottom:10px;overflow:hidden;">
                <div class="team-row-header" style="display:flex;align-items:center;gap:16px;
                     padding:12px 16px;cursor:pointer;background:var(--subtle-bg);">
                    <div style="flex:0 0 160px;font-weight:600;font-size:14px;">${esc(member.full_name)}</div>
                    <div style="flex:1;">${build_utilization_bar(member.utilization_pct)}</div>
                    <div style="text-align:right;min-width:80px;font-size:12px;color:var(--text-muted);">
                        ${member.total_estimated_hours}h / ${(member.daily_target_hours * 5).toFixed(0)}h<br>
                        ${member.active_tasks} tugas
                    </div>
                    <span class="team-toggle" style="font-size:16px;color:var(--text-muted);">▾</span>
                </div>
                <div class="team-row-body" style="display:none;">
                    ${build_task_list(member.tasks)}
                </div>
            </div>
        `);

        card.find(".team-row-header").on("click", function () {
            const body = card.find(".team-row-body");
            const open = body.is(":visible");
            body.toggle(!open);
            card.find(".team-toggle").text(open ? "▾" : "▴");
        });

        return card;
    }

    function render_summary(members) {
        const total     = members.length;
        const overloaded = members.filter((m) => m.utilization_pct >= 100).length;
        const high_load  = members.filter((m) => m.utilization_pct >= 75 && m.utilization_pct < 100).length;
        const idle       = members.filter((m) => m.utilization_pct < 10).length;

        return $(`
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;">${total}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Anggota")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--red-500);">${overloaded}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Overload (≥100%)")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--orange-500);">${high_load}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Beban Tinggi (75–99%)")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--text-muted);">${idle}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Tersedia (<10%)")}</div>
                </div>
            </div>
        `);
    }

    function render() {
        container.empty();
        container.append(`<div class="vh-empty">${__("Memuat...")}</div>`);

        const args = {};
        if (state.project) args.project = state.project;

        frappe.call({ method: TEAM_API, args }).then((r) => {
            container.empty();
            const members = r.message || [];

            if (!members.length) {
                container.append(`<div class="vh-empty">${__("Belum ada Work Profile. Set up Work Profile untuk setiap anggota tim terlebih dahulu.")}</div>`);
                return;
            }

            container.append(render_summary(members));
            container.append(`<div class="vh-section-title" style="margin-bottom:12px;">${__("Kapasitas per Anggota")}</div>`);
            members.forEach((m) => container.append(build_member_card(m)));
        });
    }

    render();
};
