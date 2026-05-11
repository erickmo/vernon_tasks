import click
import frappe
from frappe.commands import pass_context, get_site


@click.command("vernon-generate-vapid")
@click.option("--force", is_flag=True, help="Overwrite existing keys")
@pass_context
def vernon_generate_vapid(context, force):
    """Generate VAPID keys for Vernon push notifications and store in VT Settings."""
    site = get_site(context)
    frappe.init(site=site)
    frappe.connect()
    try:
        existing = frappe.db.get_single_value(
            "VT Settings", "push_vapid_public_key"
        )
        if existing and not force:
            click.echo("Public key already set. Use --force to overwrite.")
            return

        try:
            from py_vapid import Vapid
        except ImportError:
            click.echo(
                "py_vapid not installed. Run: pip install pywebpush",
                err=True,
            )
            raise SystemExit(1)

        v = Vapid()
        v.generate_keys()
        pub_b64 = v.public_key_b64urlsafe().decode()
        priv_pem = v.private_pem().decode()

        frappe.db.set_single_value(
            "VT Settings", "push_vapid_public_key", pub_b64
        )
        frappe.db.set_single_value(
            "VT Settings", "push_vapid_private_key", priv_pem
        )
        frappe.db.commit()
        click.echo(f"VAPID keys generated.\nPublic key:\n{pub_b64}")
    finally:
        frappe.destroy()
