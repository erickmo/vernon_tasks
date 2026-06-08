frappe.query_reports["KPI Achievement"] = {
    filters: [
        {fieldname: "kpi_definition", label: "KPI", fieldtype: "Link", options: "VT Item",
         get_query: () => ({filters: {node_type: "KPI"}})},
        {fieldname: "from_date", label: "From", fieldtype: "Date"},
        {fieldname: "to_date", label: "To", fieldtype: "Date"}
    ]
};
