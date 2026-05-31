import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work_mutations import complete, log_progress, snooze


class TestMyWorkMutations(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = "p1a_user_a@test.local"
        cls.user_b = "p1a_user_b@test.local"
        for u in (cls.user_a, cls.user_b):
            if not frappe.db.exists("User", u):
                frappe.get_doc({
                    "doctype": "User", "email": u, "first_name": u,
                    "roles": [{"role": "VT Member"}],
                }).insert(ignore_permissions=True)
        if not frappe.db.exists("VT Project", "TEST-P1A-PROJ"):
            proj = frappe.get_doc({
                "doctype": "VT Project",
                "name": "TEST-P1A-PROJ",
                "title": "P1a Test Project",
                "project_owner": "Administrator",
                "start_date": today(),
                "end_date": add_days(today(), 30),
            })
            proj.flags.name_set = True
            proj.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, owner, title="T"):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": today(),
            "assigned_to": owner,
            "project": "TEST-P1A-PROJ",
        })
        doc.flags.ignore_links = True
        return doc.insert(ignore_permissions=True)

    def test_complete_marks_done(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        r = complete(t.name)
        self.assertTrue(r["ok"])
        doc = frappe.get_doc("VT Task", t.name)
        self.assertEqual(doc.kanban_status, "Done")
        self.assertEqual(str(doc.completion_date), today())

    def test_complete_idempotent(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        complete(t.name)
        r = complete(t.name)
        self.assertTrue(r.get("idempotent"))

    def test_log_appends_minutes_and_comment(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        log_progress(t.name, minutes=1.5, note="part one")
        log_progress(t.name, minutes=2.0, note="part two")
        doc = frappe.get_doc("VT Task", t.name)
        self.assertEqual(doc.actual_minutes, 4)
        comments = frappe.get_all(
            "Comment",
            filters={"reference_doctype": "VT Task", "reference_name": t.name},
        )
        self.assertEqual(len(comments), 2)

    def test_log_rejects_invalid_minutes(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        for bad in (0, -1, 1441):
            with self.assertRaises(frappe.ValidationError):
                log_progress(t.name, minutes=bad)

    def test_snooze_shifts_deadline(self):
        frappe.set_user(self.user_a)
        original = today()
        for days in (1, 3, 7):
            t = self._make_task(self.user_a)
            r = snooze(t.name, days=days)
            self.assertEqual(r["deadline"], str(add_days(original, days)))

    def test_snooze_rejects_invalid_days(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        for bad in (2, 14, 0):
            with self.assertRaises(frappe.ValidationError):
                snooze(t.name, days=bad)

    def test_other_user_forbidden(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        frappe.set_user(self.user_b)
        with self.assertRaises(frappe.PermissionError):
            complete(t.name)
        with self.assertRaises(frappe.PermissionError):
            log_progress(t.name, minutes=1)
        with self.assertRaises(frappe.PermissionError):
            snooze(t.name, days=1)
