frappe.query_reports["Team Workload Overview"] = {
    filters: [{fieldname: "date", label: "Date", fieldtype: "Date", default: frappe.datetime.get_today()}]
};
