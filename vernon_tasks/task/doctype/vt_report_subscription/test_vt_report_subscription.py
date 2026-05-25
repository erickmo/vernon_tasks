"""Tests for VT Report Subscription + child Recipient."""
import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER_A = "test_sub_a@example.com"
TEST_USER_B = "test_sub_b@example.com"


def _ensure_user(email: str):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "last_name": "S",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


def _cleanup(slug: str):
	if frappe.db.exists("VT Report Subscription", slug):
		frappe.delete_doc("VT Report Subscription", slug, force=True, ignore_permissions=True)


class _SubBase(FrappeTestCase):
	SLUG = "team-throughput"

	def setUp(self):
		_ensure_user(TEST_USER_A)
		_ensure_user(TEST_USER_B)
		_cleanup(self.SLUG)

	def tearDown(self):
		_cleanup(self.SLUG)

	def _make(self, **overrides):
		base = {
			"doctype": "VT Report Subscription",
			"slug": self.SLUG,
			"title": "Weekly Team Throughput",
			"cron": "0 8 * * 1",
			"format": "csv",
			"enabled": 1,
			"recipients": [{"user": TEST_USER_A}],
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestReportSubscriptionCRUD(_SubBase):
	def test_create(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertEqual(doc.name, self.SLUG)

	def test_update_title(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.title = "Updated"
		doc.save()
		self.assertEqual(frappe.db.get_value("VT Report Subscription", doc.name, "title"), "Updated")


class TestReportSubscriptionValidations(_SubBase):
	def test_unknown_slug_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(slug="nonexistent-report").insert(ignore_permissions=True)

	def test_invalid_cron_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(cron="not a cron").insert(ignore_permissions=True)

	def test_valid_cron_variations(self):
		"""Cover documented grammar permutations."""
		for cron in ("* * * * *", "0 8 * * 1", "*/5 * * * *", "0 8,12 * * 1-5"):
			_cleanup(self.SLUG)
			doc = self._make(cron=cron).insert(ignore_permissions=True)
			self.assertEqual(doc.cron, cron)

	def test_filters_json_invalid_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(filters_json="{not valid json").insert(ignore_permissions=True)

	def test_filters_json_valid_allowed(self):
		doc = self._make(filters_json='{"project": "ACME"}').insert(ignore_permissions=True)
		self.assertEqual(doc.filters_json, '{"project": "ACME"}')

	def test_no_recipients_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(recipients=[]).insert(ignore_permissions=True)

	def test_duplicate_recipients_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(recipients=[
				{"user": TEST_USER_A},
				{"user": TEST_USER_A},
			]).insert(ignore_permissions=True)

	def test_distinct_recipients_allowed(self):
		doc = self._make(recipients=[
			{"user": TEST_USER_A},
			{"user": TEST_USER_B},
		]).insert(ignore_permissions=True)
		self.assertEqual(len(doc.recipients), 2)


class TestReportSubscriptionRecipient(_SubBase):
	def test_nonexistent_user_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(recipients=[{"user": "ghost@example.com"}]).insert(ignore_permissions=True)
