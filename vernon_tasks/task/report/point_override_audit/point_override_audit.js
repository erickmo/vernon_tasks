frappe.query_reports["Point Override Audit"] = {
    filters: [
        {fieldname: "user", label: "User", fieldtype: "Link", options: "User"},
        {fieldname: "from_date", label: "From Date", fieldtype: "Date"},
        {fieldname: "to_date", label: "To Date", fieldtype: "Date"},
    ]
};
