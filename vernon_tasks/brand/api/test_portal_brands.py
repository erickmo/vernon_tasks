import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import portal_brands

TEST_BRAND = "TestBrandAPI-X"
TEST_BRAND_2 = "TestBrandAPI-Y"


class TestPortalBrands(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        for n in (TEST_BRAND, TEST_BRAND_2):
            if frappe.db.exists("VT Brand", n):
                frappe.delete_doc("VT Brand", n, force=True, ignore_permissions=True)

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        for n in (TEST_BRAND, TEST_BRAND_2):
            if frappe.db.exists("VT Brand", n):
                frappe.delete_doc("VT Brand", n, force=True, ignore_permissions=True)

    def test_create_then_get(self):
        res = portal_brands.create_brand({"brand_name": TEST_BRAND, "description": "hi"})
        self.assertEqual(res["id"], TEST_BRAND)
        got = portal_brands.get_brand(TEST_BRAND)
        self.assertEqual(got["description"], "hi")

    def test_create_missing_name_raises(self):
        with self.assertRaises(frappe.ValidationError):
            portal_brands.create_brand({"description": "no name"})

    def test_list_filters_by_search(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        portal_brands.create_brand({"brand_name": TEST_BRAND_2})
        rows = portal_brands.list_brands(search="TestBrandAPI-X")
        names = [r["id"] for r in rows]
        self.assertIn(TEST_BRAND, names)
        self.assertNotIn(TEST_BRAND_2, names)

    def test_update_description(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        portal_brands.update_brand(TEST_BRAND, {"description": "changed"})
        self.assertEqual(
            frappe.db.get_value("VT Brand", TEST_BRAND, "description"), "changed"
        )

    def test_delete_blocked_when_linked_to_project(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        proj = frappe.get_doc({
            "doctype": "VT Project",
            "title": "BrandLinkProj",
            "brand": TEST_BRAND,
            "project_owner": "Administrator",
            "start_date": "2026-05-01",
            "end_date": "2026-05-31",
            "pdca_phase": "PLAN",
            "status": "Open",
        }).insert(ignore_permissions=True)
        try:
            with self.assertRaises(frappe.ValidationError):
                portal_brands.delete_brand(TEST_BRAND)
        finally:
            proj.delete()

    def test_search_brands_returns_options(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        rows = portal_brands.search_brands(query="TestBrandAPI")
        self.assertTrue(any(r["id"] == TEST_BRAND for r in rows))
