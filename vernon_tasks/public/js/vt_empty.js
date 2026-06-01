/**
 * vt_render_empty_state — build an action-oriented dashed-card empty state.
 *
 * Global helper (window.vt_*) following the inline-style pattern of page_nav.js,
 * so it needs no stylesheet and works on any desk page that includes it.
 *
 * @param {Object} o
 *   @param {string} o.title        - bold heading
 *   @param {string} o.message      - one-line explanation
 *   @param {string} [o.cta_label]  - primary button text
 *   @param {Function} [o.on_cta]   - primary click handler
 *   @param {string} [o.secondary_label]
 *   @param {Function} [o.on_secondary]
 * @returns {jQuery} a node to append into a page.
 */
window.vt_render_empty_state = function (o) {
    o = o || {};
    const box = $('<div class="vt-empty-state"></div>').css({
        textAlign: "center", padding: "32px 20px", borderRadius: "10px",
        background: "#f8fafc", border: "1px dashed var(--vh-border, #e2e8f0)",
        margin: "8px 0",
    });
    $("<div></div>").css({ fontWeight: 600, fontSize: "15px", marginBottom: "4px" })
        .text(o.title || "").appendTo(box);
    $("<div></div>").css({ color: "#64748b", fontSize: "13px", marginBottom: "16px" })
        .text(o.message || "").appendTo(box);
    const actions = $("<div></div>").css({
        display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap",
    });
    if (o.cta_label) {
        $('<button class="btn btn-primary btn-sm"></button>').text(o.cta_label)
            .on("click", o.on_cta || function () {}).appendTo(actions);
    }
    if (o.secondary_label) {
        $('<button class="btn btn-default btn-sm"></button>').text(o.secondary_label)
            .on("click", o.on_secondary || function () {}).appendTo(actions);
    }
    box.append(actions);
    return box;
};
