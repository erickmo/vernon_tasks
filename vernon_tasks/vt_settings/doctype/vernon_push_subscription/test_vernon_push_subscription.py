"""Tests for Vernon Push Subscription + Preference."""
import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER = "test_push@example.com"
TEST_USER_B = "test_push_b@example.com"


def _ensure_user(email: str):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": "P", "last_name": "U",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


def _cleanup_subs(user: str):
	for s in frappe.get_all("Vernon Push Subscription", filters={"user": user}, pluck="name"):
		frappe.delete_doc("Vernon Push Subscription", s, force=True, ignore_permissions=True)


class _PushBase(FrappeTestCase):
	def setUp(self):
		_ensure_user(TEST_USER)
		_ensure_user(TEST_USER_B)
		_cleanup_subs(TEST_USER)

	def tearDown(self):
		_cleanup_subs(TEST_USER)

	def _make(self, **overrides):
		base = {
			"doctype": "Vernon Push Subscription",
			"user": TEST_USER,
			"endpoint": "https://push.example.com/abc123",
			"p256dh": "BLEr...key",
			"auth": "secret-auth",
			"user_agent": "TestUA/1.0",
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestPushSubscriptionCRUD(_PushBase):
	def test_create(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertIsNotNone(doc.last_seen)


class TestPushSubscriptionValidations(_PushBase):
	def test_nonexistent_user_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(user="ghost@example.com").insert(ignore_permissions=True)

	def test_non_https_endpoint_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(endpoint="http://insecure.example.com/x").insert(ignore_permissions=True)

	def test_endpoint_immutable_after_insert(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.endpoint = "https://push.example.com/different"
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_update_user_agent_allowed(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.user_agent = "TestUA/2.0"
		doc.save()
		self.assertEqual(doc.user_agent, "TestUA/2.0")


class TestPushPreference(FrappeTestCase):
	def setUp(self):
		_ensure_user(TEST_USER)
		if frappe.db.exists("Vernon Push Preference", TEST_USER):
			frappe.delete_doc("Vernon Push Preference", TEST_USER, force=True, ignore_permissions=True)

	def tearDown(self):
		if frappe.db.exists("Vernon Push Preference", TEST_USER):
			frappe.delete_doc("Vernon Push Preference", TEST_USER, force=True, ignore_permissions=True)

	def test_create_with_defaults(self):
		doc = frappe.get_doc({
			"doctype": "Vernon Push Preference", "user": TEST_USER,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.name, TEST_USER)

	def test_nonexistent_user_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "Vernon Push Preference", "user": "ghost@example.com",
			}).insert(ignore_permissions=True)

	def test_rename_rejected(self):
		"""user is the PK; programmatic rename must fail."""
		_ensure_user(TEST_USER_B)
		frappe.get_doc({
			"doctype": "Vernon Push Preference", "user": TEST_USER,
		}).insert(ignore_permissions=True)
		# Cleanup any preference for TEST_USER_B to avoid unique conflict.
		if frappe.db.exists("Vernon Push Preference", TEST_USER_B):
			frappe.delete_doc("Vernon Push Preference", TEST_USER_B, force=True, ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.rename_doc("Vernon Push Preference", TEST_USER, TEST_USER_B)
