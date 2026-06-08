/* IIFE wrapper: desk Page scripts are run via frappe.dom.eval as a <script>
   injected into GLOBAL scope. Top-level const/let here would leak globally
   and collide ("Identifier X has already been declared") when another VT
   page declaring the same name was visited first, or on a re-eval — the whole
   script then aborts and the page renders blank. Wrapping isolates every
   declaration to function scope. */
(function () {
/* vt_tree.js — desk page "Hierarki": one-screen navigator for the unified
   VT Item nested-set tree (node_type OKR/KPI/Project/Sprint/Task).

   Rendered with Frappe's built-in `frappe.ui.Tree` widget wired to the generic
   `frappe.desk.treeview.get_children` endpoint, which works for ANY is_tree
   doctype: it derives the parent field (parent_vt_item) from the doctype name
   and returns rows of {value:name, title:title_field-or-name, expandable:is_group}.
   Clicking a node opens that VT Item's native desk form. No custom backend is
   added — correctness/reliability over fanciness. */

const VT_ITEM_DOCTYPE = "VT Item";
// Generic Frappe tree-children endpoint; works for any is_tree doctype.
const TREE_METHOD = "frappe.desk.treeview.get_children";
// Virtual root label/value: empty parent → top-level (no parent_vt_item) rows.
const ROOT_LABEL = "VT Item";

/**
 * Build the page header card: short intro + an escape-hatch button that opens
 * the native full tree view. Kept separate so on_page_load stays short.
 *
 * @param {object} page - Frappe Page object from on_page_load.
 * @returns {void}
 */
function render_intro(page) {
    const $intro = $(`
        <div class="vt-tree-intro" style="margin-bottom:16px;">
            <p class="text-muted" style="margin-bottom:8px;">
                ${__("Jelajahi hierarki VT Item: OKR → KPI → Proyek → Sprint → Task. Klik node untuk membuka detailnya.")}
            </p>
        </div>
    `);
    $intro.appendTo(page.main);

    // Escape hatch: native tree view, in case a user prefers the full toolbar.
    page.set_secondary_action(__("Tampilan pohon penuh"), () => {
        frappe.set_route("List", VT_ITEM_DOCTYPE, "Tree");
    });
}

/**
 * Instantiate frappe.ui.Tree against the generic get_children endpoint.
 * on_click opens the clicked node's VT Item form (node.label === docname,
 * since the endpoint maps `name as value` and the widget uses value as label).
 *
 * @param {object} page - Frappe Page object; tree mounts inside page.main.
 * @returns {void}
 */
function render_tree(page) {
    const $mount = $('<div class="vt-tree-mount">').appendTo(page.main);

    new frappe.ui.Tree({
        parent: $mount,
        label: ROOT_LABEL,
        // Empty root_value → get_children(parent="") → top-level VT Items.
        root_value: "",
        method: TREE_METHOD,
        args: { doctype: VT_ITEM_DOCTYPE },
        on_click: (node) => {
            // Root node has no real docname; only open forms for real items.
            if (node.is_root || !node.data || !node.data.value) return;
            frappe.set_route("Form", VT_ITEM_DOCTYPE, node.data.value);
        },
    });
}

frappe.pages["vt-tree"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Hierarki"),
        single_column: true,
    });

    render_intro(page);
    render_tree(page);
};

})();
