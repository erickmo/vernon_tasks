import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work_mutations import complete, log_progress, snooze

_PROJ_TITLE = "TEST-P1A-PROJ"


def _cleanup_proj():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for proj in frappe.get_all(
		"VT Item",
		{"title": _PROJ_TITLE, "node_type": "Project"},
		["name", "lft", "rgt"],
	):
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True)
		frappe.delete_doc("VT Item", proj["name"], force=True)


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
		frappe.set_user("Administrator")
		_cleanup_proj()
		cls.project = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": _PROJ_TITLE,
			"owner_user": "Administrator",
			"start_date": "2026-01-01",
			"end_date": "2026-12-31",
			"health_status": "Open",
		}).insert(ignore_permissions=True).name

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		_cleanup_proj()
		super().tearDownClass()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _make_task(self, owner, title="T"):
		return frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Task",
			"title": title,
			"deadline": today(),
			"owner_user": owner,
			"parent_vt_item": self.project,
			"pdca_phase": "DO",
		}).insert(ignore_permissions=True)

	def test_complete_marks_done(self):
		frappe.set_user(self.user_a)
		t = self._make_task(self.user_a)
		r = complete(t.name)
		self.assertTrue(r["ok"])
		doc = frappe.get_doc("VT Item", t.name)
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
		doc = frappe.get_doc("VT Item", t.name)
		self.assertEqual(doc.actual_minutes, 4)
		comments = frappe.get_all(
			"Comment",
			filters={"reference_doctype": "VT Item", "reference_name": t.name},
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
