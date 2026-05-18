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
    if _exists("Website Theme", "Vernon Tasks Theme"):
        print("✓ Website Theme 'Vernon Tasks Theme' already exists, skipping")
        return
    doc = frappe.get_doc({
        "doctype": "Website Theme",
        "theme": "Vernon Tasks Theme",
        "google_font": "Inter",
        "top_bar_color": "#6d28d9",
        "top_bar_text_color": "#ffffff",
        "top_bar_hover_color": "#7c3aed",
        "primary_action_color": "#6366f1",
        "custom_css": """:root {
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
}""",
    })
    doc.insert(ignore_permissions=True)
    print("✓ Created Website Theme 'Vernon Tasks Theme'")

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
                "url": "/portal",
            },
            {
                "doctype": "Website Slideshow Item",
                "image": "/assets/vernon_tasks/images/hero-pdca.webp",
                "heading": "PDCA Workflow yang Terstruktur",
                "description": "Plan → Do → Check → Act dalam setiap task",
                "url": "/portal",
            },
            {
                "doctype": "Website Slideshow Item",
                "image": "/assets/vernon_tasks/images/hero-team.webp",
                "heading": "Visibilitas Penuh untuk Leader & Owner",
                "description": "Dashboard real-time: siapa blocked, siapa on track",
                "url": "/portal",
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
    <a href="/portal" class="btn btn-secondary btn-lg">Lihat Portal</a>
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
    metas = [
        {
            "route": "/",
            "page_title": "Vernon Tasks — Manajemen Tim & OKR",
            "description": "Platform manajemen project, OKR, dan PDCA untuk tim Indonesia",
            "og_image": "/assets/vernon_tasks/images/og-home.webp",
        },
        {
            "route": "/portal",
            "page_title": "Portal — Vernon Tasks",
            "description": "Dashboard real-time untuk leader, owner, dan anggota tim",
            "og_image": "/assets/vernon_tasks/images/og-portal.webp",
        },
        {
            "route": "/tentang",
            "page_title": "Tentang Vernon Tasks",
            "description": "Visi, misi, dan cerita di balik Vernon Tasks",
            "og_image": "/assets/vernon_tasks/images/og-about.webp",
        },
        {
            "route": "/kontak",
            "page_title": "Hubungi Vernon Tasks",
            "description": "Konsultasi dan demo produk Vernon Tasks",
            "og_image": "/assets/vernon_tasks/images/og-contact.webp",
        },
    ]
    for meta in metas:
        if frappe.db.exists("Website Route Meta", {"route": meta["route"]}):
            print(f"✓ Route Meta '{meta['route']}' already exists, skipping")
            continue
        doc = frappe.get_doc({"doctype": "Website Route Meta", **meta})
        doc.insert(ignore_permissions=True)
        print(f"✓ Created Website Route Meta: {meta['route']}")


def setup_portal_settings():
    """Configure Portal Settings: login redirect and default role.

    Idempotent: only writes if values differ from current state.
    """
    ps = frappe.get_doc("Portal Settings")
    changed = False
    if ps.login_redirect != "/portal":
        ps.login_redirect = "/portal"
        changed = True
    if getattr(ps, "logout_redirect", None) != "/":
        ps.logout_redirect = "/"
        changed = True
    try:
        if ps.default_role != "VT Member":
            ps.default_role = "VT Member"
            changed = True
    except AttributeError:
        frappe.log("Portal Settings has no default_role field; skipping.")
    if changed:
        ps.save(ignore_permissions=True)
        print("✓ Configured Portal Settings: login_redirect=/portal, logout_redirect=/")
    else:
        print("✓ Portal Settings already configured correctly, skipping")


def execute():
    """Entry point for bench execute."""
    print("\n=== Vernon Tasks Website Setup ===\n")
    setup_website_theme()
    setup_slideshow()
    setup_web_pages()
    setup_web_form()
    setup_route_meta()
    setup_portal_settings()
    frappe.db.commit()
    print("\n=== Setup complete! ===")
    print("\nNext steps:")
    print("  bench --site <site> export-fixtures --app vernon_tasks")
    print("  git add vernon_tasks/fixtures/")
    print("  git commit -m 'chore(fixtures): export Frappe native website config'")
