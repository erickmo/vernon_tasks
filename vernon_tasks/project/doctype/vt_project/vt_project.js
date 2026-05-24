frappe.ui.form.on("VT Project", {
    refresh(frm) {
        frm.set_query("user", "team_members", () => {
            const exclude = [frm.doc.project_owner, frm.doc.project_leader].filter(Boolean);
            return {
                filters: [
                    ["User", "enabled", "=", 1],
                    ...(exclude.length ? [["User", "name", "not in", exclude]] : []),
                ],
            };
        });
    },
    project_owner(frm) {
        frm.refresh_field("team_members");
    },
    project_leader(frm) {
        frm.refresh_field("team_members");
    },
});
