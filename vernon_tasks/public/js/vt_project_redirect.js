/* vt_project_redirect.js — desk router guard.
   Redirects the native VT Project list view (/app/vt-project) to the custom
   cards page (/app/vt-projects). The native Form view (New / Edit) is left
   untouched so creating and editing a project still uses the original form. */

const VT_PROJECT_DOCTYPE = "VT Project";
const VT_PROJECTS_PAGE = "vt-projects";

frappe.router.on("change", () => {
    const route = frappe.get_route();
    // route[0] === "List" only for list/report/etc. views; "Form" (New/Edit) is skipped.
    if (route[0] === "List" && route[1] === VT_PROJECT_DOCTYPE) {
        frappe.set_route(VT_PROJECTS_PAGE);
    }
});
