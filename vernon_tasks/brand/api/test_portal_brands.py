import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import portal_brands

TEST_BRAND = "TestBrandAPI-X"
TEST_BRAND_2 = "TestBrandAPI-Y"
TEST_BRAND_EMPTY = "TestBrandAPI-Empty"


class TestPortalBrands(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        for n in (TEST_BRAND, TEST_BRAND_2, TEST_BRAND_EMPTY):
            if frappe.db.exists("VT Brand", n):
                frappe.delete_doc("VT Brand", n, force=True, ignore_permissions=True)

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        # Brands can't be deleted while linked; tear down dependents first
        # (sprints + tasks before their project, then the brand).
        for n in (TEST_BRAND, TEST_BRAND_2, TEST_BRAND_EMPTY):
            for p in frappe.get_all("VT Project", filters={"brand": n}, pluck="name"):
                for s in frappe.get_all("VT Sprint", filters={"project": p}, pluck="name"):
                    frappe.delete_doc("VT Sprint", s, force=True, ignore_permissions=True)
                for t in frappe.get_all("VT Task", filters={"project": p}, pluck="name"):
                    frappe.delete_doc("VT Task", t, force=True, ignore_permissions=True)
                frappe.delete_doc("VT Project", p, force=True, ignore_permissions=True)
            if frappe.db.exists("VT Brand", n):
                frappe.delete_doc("VT Brand", n, force=True, ignore_permissions=True)

    def _mk_project(self, brand: str) -> str:
        doc = frappe.get_doc({
            "doctype": "VT Project", "title": f"Proj-{brand}", "brand": brand,
            "project_owner": "Administrator", "start_date": "2026-05-01",
            "end_date": "2026-05-31", "pdca_phase": "PLAN", "status": "Open",
        }).insert(ignore_permissions=True)
        return doc.name

    def _mk_task(self, project: str, phase: str, minutes: int) -> str:
        doc = frappe.get_doc({
            "doctype": "VT Task", "title": f"T-{phase}-{minutes}",
            "project": project, "pdca_phase": phase, "estimated_minutes": minutes,
        }).insert(ignore_permissions=True)
        return doc.name

    def _row_for(self, brand: str) -> dict:
        rows = portal_brands.list_brands()
        return next(r for r in rows if r["id"] == brand)

    def test_list_includes_brand_stats(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        proj = self._mk_project(TEST_BRAND)
        self._mk_task(proj, "DO", 60)    # open (In Progress)
        self._mk_task(proj, "DO", 120)   # open
        self._mk_task(proj, "DONE", 60)  # done
        frappe.get_doc({
            "doctype": "VT Sprint", "sprint_title": "S-1", "project": proj,
            "status": "Active", "start_date": "2026-05-01", "end_date": "2026-05-14",
        }).insert(ignore_permissions=True)

        row = self._row_for(TEST_BRAND)
        # total=240, remaining=180 (two DO), done=60 -> progress (240-180)/240 = 25%
        self.assertEqual(row["remaining_tasks"], 2)
        self.assertEqual(row["remaining_minutes"], 180)
        self.assertEqual(row["total_minutes"], 240)
        self.assertEqual(row["progress_pct"], 25)
        self.assertEqual(row["active_sprint_count"], 1)
        self.assertEqual(row["active_sprint_title"], "S-1")

    def test_cancelled_task_excluded(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        proj = self._mk_project(TEST_BRAND)
        task = self._mk_task(proj, "DO", 100)
        # Cancelled docs (docstatus=2) must drop out of every tally.
        frappe.db.set_value("VT Task", task, "docstatus", 2)

        row = self._row_for(TEST_BRAND)
        self.assertEqual(row["remaining_tasks"], 0)
        self.assertEqual(row["remaining_minutes"], 0)
        self.assertEqual(row["total_minutes"], 0)
        self.assertEqual(row["progress_pct"], 0)

    def test_progress_count_fallback_when_no_estimates(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        proj = self._mk_project(TEST_BRAND)
        self._mk_task(proj, "DO", 0)     # open, un-estimated
        self._mk_task(proj, "DONE", 0)   # done
        self._mk_task(proj, "DONE", 0)   # done

        row = self._row_for(TEST_BRAND)
        # total_minutes=0 -> fall back to done/total tasks = 2/3 = 67%
        self.assertEqual(row["total_minutes"], 0)
        self.assertEqual(row["remaining_tasks"], 1)
        self.assertEqual(row["progress_pct"], 67)

    def test_list_zero_stats_for_brand_without_projects(self):
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        row = self._row_for(TEST_BRAND)
        self.assertEqual(row["remaining_tasks"], 0)
        self.assertEqual(row["total_minutes"], 0)
        self.assertEqual(row["progress_pct"], 0)
        self.assertEqual(row["active_sprint_count"], 0)
        self.assertIsNone(row["active_sprint_title"])

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

    def test_brand_execution_matches_stats_map_and_lists_projects(self):
        # PRD-brand | spec: 2026-06-06-brand-detail-informative
        # brand_execution(brand) must equal the per-brand slice of the list-endpoint
        # rollup (proves the numbers cannot drift) and must list the brand's projects.
        portal_brands.create_brand({"brand_name": TEST_BRAND})
        proj = self._mk_project(TEST_BRAND)
        self._mk_task(proj, "DO", 60)
        self._mk_task(proj, "DO", 120)
        self._mk_task(proj, "DONE", 60)
        frappe.get_doc({
            "doctype": "VT Sprint", "sprint_title": "S-exec", "project": proj,
            "status": "Active", "start_date": "2026-05-01", "end_date": "2026-05-14",
        }).insert(ignore_permissions=True)

        exec_block = portal_brands.brand_execution(TEST_BRAND)
        map_slice = portal_brands._brand_stats_map().get(TEST_BRAND, portal_brands._zero_stats())

        self.assertEqual(exec_block["progress_pct"], map_slice["progress_pct"])
        self.assertEqual(exec_block["remaining_tasks"], map_slice["remaining_tasks"])
        self.assertEqual(exec_block["remaining_minutes"], map_slice["remaining_minutes"])
        self.assertEqual(exec_block["total_minutes"], map_slice["total_minutes"])
        self.assertEqual(exec_block["active_sprint_count"], map_slice["active_sprint_count"])
        self.assertEqual(exec_block["active_sprint_title"], map_slice["active_sprint_title"])

        self.assertGreaterEqual(exec_block["project_count"], 1)
        self.assertTrue(all({"id", "name", "progress"} <= set(p) for p in exec_block["projects"]))

    def test_brand_execution_empty_brand_is_zero(self):
        # A brand with no projects returns zeros + empty project list, never errors.
        portal_brands.create_brand({"brand_name": TEST_BRAND_EMPTY})
        block = portal_brands.brand_execution(TEST_BRAND_EMPTY)
        self.assertEqual(block["project_count"], 0)
        self.assertEqual(block["progress_pct"], 0)
        self.assertEqual(block["projects"], [])
