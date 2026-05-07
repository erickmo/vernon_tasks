import frappe
from frappe.tests.utils import FrappeTestCase


class TestVTSettings(FrappeTestCase):
    def test_default_values_exist(self):
        settings = frappe.get_single("VT Settings")
        self.assertIsNotNone(settings.weight_multiplier)
        self.assertIsNotNone(settings.early_bonus_rate)
        self.assertIsNotNone(settings.late_penalty_rate)
        self.assertIsNotNone(settings.revision_deduct_rate)
        self.assertIsNotNone(settings.default_daily_target_hours)

    def test_get_settings_helper(self):
        from vernon_tasks.vt_settings.doctype.vt_settings.vt_settings import get_settings
        settings = get_settings()
        self.assertEqual(settings.doctype, "VT Settings")

    def test_invalid_weight_multiplier_raises(self):
        settings = frappe.get_single("VT Settings")
        original = settings.weight_multiplier
        settings.weight_multiplier = -1
        with self.assertRaises(frappe.ValidationError):
            settings.validate()
        settings.weight_multiplier = original
