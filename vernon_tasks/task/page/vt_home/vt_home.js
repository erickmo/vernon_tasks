frappe.pages["vt-home"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Beranda"),
        single_column: true,
    });

    const container = $('<div class="vt-home"></div>').appendTo(page.main);
    container.html('<p style="padding:20px;">Dashboard loading…</p>');
};
