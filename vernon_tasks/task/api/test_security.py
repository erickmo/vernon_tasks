import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.security import require_login, rate_limit, clamp_int, max_str


class TestSecurity(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "security_test@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc(
                {"doctype": "User", "email": cls.user, "first_name": "Security"}
            ).insert(ignore_permissions=True)

    # --- require_login ---

    def test_require_login_raises_for_guest(self):
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, require_login)

    def test_require_login_passes_for_authenticated_user(self):
        frappe.set_user(self.user)
        require_login()  # must not raise

    # --- rate_limit ---

    def test_rate_limit_allows_calls_under_limit(self):
        frappe.set_user(self.user)
        ep = f"test_under_{frappe.utils.now_datetime().microsecond}"
        for _ in range(3):
            rate_limit(ep, 5)  # 3 < 5, no raise

    def test_rate_limit_raises_when_limit_exceeded(self):
        frappe.set_user(self.user)
        ep = f"test_over_{frappe.utils.now_datetime().microsecond}"
        for _ in range(5):
            rate_limit(ep, 5)  # 5th call == max, still OK
        # 6th call exceeds
        self.assertRaises(frappe.ValidationError, rate_limit, ep, 5)

    def test_rate_limit_skips_for_guest(self):
        frappe.set_user("Guest")
        ep = f"test_guest_{frappe.utils.now_datetime().microsecond}"
        # max=0 but Guest session → must NOT raise
        rate_limit(ep, 0)

    # --- clamp_int ---

    def test_clamp_int_returns_value_in_range(self):
        self.assertEqual(clamp_int(50, 1, 100, "x"), 50)
        self.assertEqual(clamp_int("10", 1, 100, "x"), 10)
        self.assertEqual(clamp_int(1, 1, 100, "x"), 1)    # lo boundary
        self.assertEqual(clamp_int(100, 1, 100, "x"), 100)  # hi boundary

    def test_clamp_int_raises_below_lo(self):
        self.assertRaises(frappe.ValidationError, clamp_int, 0, 1, 100, "x")

    def test_clamp_int_raises_above_hi(self):
        self.assertRaises(frappe.ValidationError, clamp_int, 101, 1, 100, "x")

    def test_clamp_int_raises_for_non_integer_string(self):
        self.assertRaises(frappe.ValidationError, clamp_int, "abc", 1, 100, "x")

    # --- max_str ---

    def test_max_str_truncates_at_limit(self):
        result = max_str("a" * 300, 200)
        self.assertEqual(len(result), 200)

    def test_max_str_preserves_string_under_limit(self):
        self.assertEqual(max_str("hello", 200), "hello")

    def test_max_str_returns_empty_for_none(self):
        self.assertEqual(max_str(None, 200), "")
