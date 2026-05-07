frappe.query_reports["My Points Progress"] = {
    filters: [{fieldname: "user", label: "User", fieldtype: "Link", options: "User", default: frappe.session.user}]
};
