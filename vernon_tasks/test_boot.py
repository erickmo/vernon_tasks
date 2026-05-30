# Tests for navbar2 boot injection. Spec: docs/superpowers/specs/2026-05-30-vt-navbar-projects-design.html
import frappe
import unittest

from vernon_tasks.boot import extend_bootinfo, DEFAULT_NAVBAR


class _Boot(dict):
    # bootinfo behaves like an attr-accessible dict in Frappe; emulate the attribute set.
    def __getattr__(self, k):
        return self[k]

    def __setattr__(self, k, v):
        self[k] = v


class TestNavbarBoot(unittest.TestCase):
    def setUp(self):
        self.settings = frappe.get_single("VT Settings")
        self.settings.set("navbar_items", [])
        self.settings.save(ignore_permissions=True)

    def test_defaults_when_empty(self):
        boot = _Boot()
        extend_bootinfo(boot)
        self.assertEqual(boot.vt_navbar_items, DEFAULT_NAVBAR)

    def test_returns_enabled_rows_in_order(self):
        self.settings.append("navbar_items", {"label": "A", "route": "/app/a", "enabled": 1})
        self.settings.append("navbar_items", {"label": "B", "route": "/app/b", "enabled": 0})
        self.settings.append("navbar_items", {"label": "C", "route": "/app/c", "enabled": 1})
        self.settings.save(ignore_permissions=True)
        boot = _Boot()
        extend_bootinfo(boot)
        labels = [r["label"] for r in boot.vt_navbar_items]
        self.assertEqual(labels, ["A", "C"])  # B disabled, order by idx
