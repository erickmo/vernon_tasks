# vernon_tasks/setup_website.py
"""
Website seed script for Vernon Tasks.

Run on a live bench server:
    bench --site <site> execute vernon_tasks.setup_website

After running, export fixtures:
    bench --site <site> export-fixtures --app vernon_tasks
    git add vernon_tasks/fixtures/
    git commit -m "chore(fixtures): export Frappe native website config"
"""
import frappe


def _exists(doctype, name):
    return bool(frappe.db.exists(doctype, name))


def setup_website_theme():
    """Create Vernon Tasks Theme using Frappe v15 schema.

    Bypasses validate() via raw DB insert to avoid SCSS generation errors
    caused by missing app modules in this environment (e.g. vernon_portal).
    custom_scss field holds CSS overrides (v15 renamed from custom_css).
    """
    CUSTOM_SCSS = """:root {
  --vt-purple: #6d28d9;
  --vt-indigo: #6366f1;
  --vt-violet: #8b5cf6;
}
.navbar {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(109, 40, 217, 0.95) !important;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.btn-primary {
  background: linear-gradient(135deg, var(--vt-indigo), var(--vt-purple));
  border: none;
  border-radius: 8px;
}
.btn-primary:hover {
  background: linear-gradient(135deg, var(--vt-purple), var(--vt-violet));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(109, 40, 217, 0.35);
}"""
    if _exists("Website Theme", "Vernon Tasks Theme"):
        print("✓ Website Theme 'Vernon Tasks Theme' already exists, skipping")
    else:
        # Raw insert bypasses validate() + SCSS generation (v15 compatible columns).
        frappe.db.sql("""
            INSERT INTO `tabWebsite Theme`
                (name, theme, google_font, primary_color, custom_scss,
                 owner, modified_by, creation, modified, docstatus, idx)
            VALUES
                ('Vernon Tasks Theme', 'Vernon Tasks Theme', 'Inter',
                 '#6366f1', %(scss)s,
                 'Administrator', 'Administrator', NOW(), NOW(), 0, 0)
        """, {"scss": CUSTOM_SCSS})
        frappe.db.commit()
        print("✓ Created Website Theme 'Vernon Tasks Theme' (v15 raw insert)")

    # Set as active theme in Website Settings
    frappe.db.set_value("Website Settings", "Website Settings", "theme", "Vernon Tasks Theme")
    print("✓ Set Vernon Tasks Theme as active in Website Settings")


def setup_slideshow():
    if _exists("Website Slideshow", "Vernon Hero"):
        print("✓ Website Slideshow 'Vernon Hero' already exists, skipping")
        return
    doc = frappe.get_doc({
        "doctype": "Website Slideshow",
        "slideshow_name": "Vernon Hero",
        "slideshow_interval": 5000,
        "slideshow_items": [
            {
                "doctype": "Website Slideshow Item",
                "image": "/assets/vernon_tasks/images/hero-okr.webp",
                "heading": "Kelola OKR & Sprint dalam Satu Platform",
                "description": "Hubungkan target organisasi ke task harian tim Anda",
                "url": "/app",
            },
            {
                "doctype": "Website Slideshow Item",
                "image": "/assets/vernon_tasks/images/hero-pdca.webp",
                "heading": "PDCA Workflow yang Terstruktur",
                "description": "Plan → Do → Check → Act dalam setiap task",
                "url": "/app",
            },
            {
                "doctype": "Website Slideshow Item",
                "image": "/assets/vernon_tasks/images/hero-team.webp",
                "heading": "Visibilitas Penuh untuk Leader & Owner",
                "description": "Dashboard real-time: siapa blocked, siapa on track",
                "url": "/app",
            },
        ],
    })
    doc.insert(ignore_permissions=True)
    print("✓ Created Website Slideshow 'Vernon Hero' with 3 slides")


def setup_web_pages():
    pages = [
        {
            "doctype": "Web Page",
            "title": "Vernon Tasks — Kelola Kerja Tim Anda",
            "route": "",
            "published": 1,
            "slideshow": "Vernon Hero",
            "main_section": """<section class="vt-hero-cta" style="text-align:center;padding:60px 20px;">
  <h2 style="font-size:2rem;margin-bottom:16px;">Fitur Utama</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:900px;margin:0 auto 40px;">
    <div><h3>🎯 OKR Tracking</h3><p>Hubungkan target organisasi ke task harian</p></div>
    <div><h3>🔄 PDCA Workflow</h3><p>Struktur kerja Plan-Do-Check-Act</p></div>
    <div><h3>🏃 Sprint Board</h3><p>Agile sprint dengan visibilitas penuh</p></div>
  </div>
  <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
    <a href="/login" class="btn btn-primary btn-lg">Mulai Sekarang</a>
    <a href="/app" class="btn btn-secondary btn-lg">Buka Aplikasi</a>
  </div>
</section>""",
        },
        {
            "doctype": "Web Page",
            "title": "Tentang Vernon Tasks",
            "route": "tentang",
            "published": 1,
            "main_section": """<section style="max-width:800px;margin:0 auto;padding:60px 20px;">
  <h2>Tentang Vernon Tasks</h2>
  <p>Platform manajemen project yang memadukan OKR, PDCA, dan Agile untuk tim Indonesia.
     Dirancang untuk visibilitas dan akuntabilitas penuh.</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px;">
    <div><h3>Transparansi</h3><p>Semua orang tahu siapa mengerjakan apa</p></div>
    <div><h3>Akuntabilitas</h3><p>Setiap task punya pemilik dan deadline</p></div>
    <div><h3>Pertumbuhan</h3><p>PDCA memastikan perbaikan berkelanjutan</p></div>
  </div>
</section>""",
        },
        {
            "doctype": "Web Page",
            "title": "Hubungi Kami",
            "route": "kontak",
            "published": 1,
            "main_section": """<section style="max-width:700px;margin:0 auto;padding:60px 20px;">
  <h2>Hubungi Kami</h2>
  <p>Ingin tahu lebih lanjut? Klik tombol di bawah untuk mengisi formulir kontak kami.</p>
  <a href="/kontak-form" class="btn btn-primary btn-lg"
     style="display:inline-block;margin-top:16px;">
    Isi Formulir Kontak
  </a>
  <p style="margin-top:24px;color:#666;font-size:0.9rem;">
    Atau email kami langsung di
    <a href="mailto:hello@vernoncorp.com">hello@vernoncorp.com</a>
  </p>
</section>""",
        },
    ]
    for page_data in pages:
        route = page_data["route"] or "(home)"
        if frappe.db.exists("Web Page", {"route": page_data["route"]}):
            print(f"✓ Web Page route='{route}' already exists, skipping")
            continue
        doc = frappe.get_doc(page_data)
        doc.insert(ignore_permissions=True)
        print(f"✓ Created Web Page: {page_data['title']} (route='{route}')")


def setup_web_form():
    if _exists("Web Form", "Hubungi Kami"):
        print("✓ Web Form 'Hubungi Kami' already exists, skipping")
        return
    doc = frappe.get_doc({
        "doctype": "Web Form",
        "title": "Hubungi Kami",
        "route": "kontak-form",
        "doc_type": "VT Contact Request",
        "module": "Vt Settings",
        "published": 1,
        "allow_edit": 0,
        "allow_multiple": 1,
        "login_required": 0,
        "success_url": "/terima-kasih",
        "success_message": "Terima kasih! Kami akan menghubungi Anda segera.",
        "web_form_fields": [
            {"doctype": "Web Form Field", "fieldname": "full_name", "label": "Nama Lengkap", "reqd": 1},
            {"doctype": "Web Form Field", "fieldname": "email", "label": "Email", "reqd": 1},
            {"doctype": "Web Form Field", "fieldname": "company", "label": "Nama Perusahaan", "reqd": 0},
            {"doctype": "Web Form Field", "fieldname": "team_size", "label": "Ukuran Tim", "reqd": 0},
            {"doctype": "Web Form Field", "fieldname": "message", "label": "Pesan", "reqd": 1},
        ],
    })
    doc.insert(ignore_permissions=True)
    print("✓ Created Web Form 'Hubungi Kami' → VT Contact Request")


def setup_route_meta():
    """Create Website Route Meta records for SEO.

    Frappe v15 schema: name = route (URL path),
    meta_tags child table holds key-value pairs (title, description, og:*).
    """
    metas = [
        {
            "name": "/",
            "title": "Vernon Tasks — Manajemen Tim & OKR",
            "description": "Platform manajemen project, OKR, dan PDCA untuk tim Indonesia",
            "og_image": "/assets/vernon_tasks/images/og-home.webp",
        },
        {
            "name": "/tentang",
            "title": "Tentang Vernon Tasks",
            "description": "Visi, misi, dan cerita di balik Vernon Tasks",
            "og_image": "/assets/vernon_tasks/images/og-about.webp",
        },
        {
            "name": "/kontak",
            "title": "Hubungi Vernon Tasks",
            "description": "Konsultasi dan demo produk Vernon Tasks",
            "og_image": "/assets/vernon_tasks/images/og-contact.webp",
        },
    ]
    for meta in metas:
        route = meta["name"]
        if frappe.db.exists("Website Route Meta", route):
            print(f"✓ Route Meta '{route}' already exists, skipping")
            continue
        doc = frappe.get_doc({
            "doctype": "Website Route Meta",
            "name": route,
            "meta_tags": [
                {"doctype": "Website Meta Tag", "key": "title", "value": meta["title"]},
                {"doctype": "Website Meta Tag", "key": "description", "value": meta["description"]},
                {"doctype": "Website Meta Tag", "key": "og:title", "value": meta["title"]},
                {"doctype": "Website Meta Tag", "key": "og:description", "value": meta["description"]},
                {"doctype": "Website Meta Tag", "key": "og:image", "value": meta["og_image"]},
            ],
        })
        doc.insert(ignore_permissions=True)
        print(f"✓ Created Website Route Meta: {route}")


def setup_portal_settings():
    """Configure Portal branding via Portal Appearance (Frappe v15).

    Frappe v15 replaced Portal Settings with Portal Appearance + Portal Menu Item.
    Sets brand name, accent colors. Login redirect is handled via Website Settings.
    """
    try:
        if not frappe.db.exists("DocType", "Portal Appearance"):
            print("⚠ Portal Appearance DocType not found — skipping portal branding")
            return
        existing = frappe.db.get_all("Portal Appearance", limit=1)
        if existing:
            pa = frappe.get_doc("Portal Appearance", existing[0].name)
        else:
            pa = frappe.get_doc({"doctype": "Portal Appearance"})
        pa.brand_name = "Vernon Tasks"
        pa.accent_color = "#6d28d9"
        pa.gradient_from = "#6366f1"
        pa.gradient_to = "#6d28d9"
        pa.tagline = "Kelola Kerja Tim Anda"
        pa.save(ignore_permissions=True)
        print("✓ Configured Portal Appearance: Vernon Tasks brand + purple accent")
    except Exception as e:
        print(f"⚠ Portal Appearance setup skipped: {e}")


def _ensure_vt_contact_request_table():
    """Create VT Contact Request table if migrate hasn't run yet."""
    if frappe.db.table_exists("VT Contact Request"):
        return
    print("⚙ Creating VT Contact Request table (running reload_doc)...")
    frappe.reload_doc("Vt Settings", "doctype", "vt_contact_request", force=True)
    frappe.db.commit()
    if frappe.db.table_exists("VT Contact Request"):
        print("✓ VT Contact Request table created")
    else:
        print("⚠ VT Contact Request table still missing — run bench migrate first")


# Ordered navbar items for VT Settings.
# is_group=1 items are dropdown group headers; route="#" is placeholder for non-navigable groups.
# role_restriction: blank = all roles. Single role = only users with that role.
_NAVBAR_ITEMS = [
    # ── Standalone ────────────────────────────────────────────────────────
    dict(label="Beranda",        route="/app/vt-home",        icon="home",          is_group=0, parent_group="",       role_restriction="",          enabled=1),
    # ── Saya group (all roles) ────────────────────────────────────────────
    dict(label="Saya",           route="#",                   icon="user",          is_group=1, parent_group="",       role_restriction="",          enabled=1),
    dict(label="My Work",        route="/app/my-work",        icon="check-circle",  is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Dashboard",      route="/app/my-dashboard",   icon="bar-chart",     is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Analytics",      route="/app/my-analytics",   icon="trend",         is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Scorecard",      route="/app/vt-scorecard",   icon="star",          is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    # ── Proyek standalone ────────────────────────────────────────────────
    dict(label="Proyek",         route="/app/vt-projects",    icon="folder-normal", is_group=0, parent_group="",       role_restriction="",          enabled=1),
    # ── Leader group ─────────────────────────────────────────────────────
    dict(label="Leader",         route="#",                   icon="users",         is_group=1, parent_group="",       role_restriction="VT Leader", enabled=1),
    dict(label="Dashboard Tim",  route="/app/leader-dashboard",icon="dashboard",    is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Review",         route="/app/leader-review",  icon="tick",          is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Sprint Analytics",route="/app/leader-analytics",icon="chart",       is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="OKR",            route="/app/vt-okr",         icon="target-doc",    is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Tim & Kapasitas",route="/app/vt-team",        icon="users",         is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    # ── Eksekutif standalone (Manager) ───────────────────────────────────
    dict(label="Eksekutif",      route="/app/exec-analytics", icon="chart",         is_group=0, parent_group="",       role_restriction="VT Manager",enabled=1),
    # ── Admin group (Manager) ─────────────────────────────────────────────
    dict(label="Admin",          route="#",                   icon="setting",       is_group=1, parent_group="",       role_restriction="VT Manager",enabled=1),
    dict(label="Pengaturan",     route="/app/vt-settings",    icon="setting",       is_group=0, parent_group="Admin",  role_restriction="VT Manager",enabled=1),
    dict(label="Brand",          route="/app/vt-brands",      icon="badge",         is_group=0, parent_group="Admin",  role_restriction="VT Manager",enabled=1),
]


def setup_navbar_items():
    """Seed VT Settings navbar_items with the full structured menu.

    Safe to re-run: deletes old rows via DB then re-inserts via append.
    """
    # Delete existing navbar items from DB
    frappe.db.delete("VT Navbar Item", {})
    frappe.db.commit()

    # Insert new items
    doc = frappe.get_single("VT Settings")
    for item in _NAVBAR_ITEMS:
        doc.append("navbar_items", item)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    print(f"✓ Seeded {len(_NAVBAR_ITEMS)} navbar items into VT Settings")


def ensure_navbar_seeded():
    """Seed navbar items only if none exist (preserves admin customization).

    Wired to after_install + after_migrate so a fresh deploy exposes the full
    menu instead of the 2-item DEFAULT_NAVBAR fallback. Safe on every migrate.
    """
    if frappe.db.count("VT Navbar Item", {"parenttype": "VT Settings"}):
        return
    setup_navbar_items()


def execute():
    """Entry point for bench execute."""
    print("\n=== Vernon Tasks Website Setup ===\n")
    _ensure_vt_contact_request_table()
    setup_website_theme()
    setup_slideshow()
    setup_web_pages()
    setup_web_form()
    setup_route_meta()
    setup_portal_settings()
    setup_navbar_items()
    frappe.db.commit()
    print("\n=== Setup complete! ===")
    print("\nNext steps:")
    print("  bench --site <site> export-fixtures --app vernon_tasks")
    print("  git add vernon_tasks/fixtures/")
    print("  git commit -m 'chore(fixtures): export Frappe native website config'")
