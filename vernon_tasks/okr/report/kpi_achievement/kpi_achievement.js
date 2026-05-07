frappe.query_reports["KPI Achievement"] = {
    filters: [
        {fieldname: "kpi_definition", label: "KPI", fieldtype: "Link", options: "KPI Definition"},
        {fieldname: "from_date", label: "From", fieldtype: "Date"},
        {fieldname: "to_date", label: "To", fieldtype: "Date"}
    ]
};
