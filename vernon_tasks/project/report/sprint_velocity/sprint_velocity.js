frappe.query_reports["Sprint Velocity"] = {
    filters: [
        {
            fieldname: "project",
            label: "Project",
            fieldtype: "Link",
            options: "VT Item",
            get_query: () => ({filters: {node_type: "Project"}})
        }
    ]
};
