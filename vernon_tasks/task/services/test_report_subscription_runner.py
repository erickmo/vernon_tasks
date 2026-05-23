from datetime import datetime, timedelta

from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services.report_subscription_runner import (
    _build_csv_attachment,
    _build_html_body,
    _is_due,
)


class TestReportSubscriptionRunner(FrappeTestCase):
    def test_is_due_when_cron_elapsed(self):
        now = datetime.now()
        last = now - timedelta(hours=2)
        # "every hour at minute 0" — must be due after 2h gap
        self.assertTrue(_is_due("0 * * * *", last, now))

    def test_not_due_when_last_run_recent_and_cron_weekly(self):
        now = datetime.now()
        last = now - timedelta(minutes=1)
        # weekly Sunday midnight — should not fire 1m after last run
        self.assertFalse(_is_due("0 0 * * 0", last, now))

    def test_is_due_with_no_last_run(self):
        now = datetime.now()
        # Never run before — should be due
        self.assertTrue(_is_due("0 * * * *", None, now))

    def test_build_csv_attachment_shape(self):
        payload = {
            "slug": "x",
            "columns": [
                {"key": "a", "label": "A", "type": "string"},
                {"key": "b", "label": "B", "type": "number"},
            ],
            "rows": [{"a": "hi", "b": 1}],
        }
        att = _build_csv_attachment(payload)
        self.assertEqual(att["fname"], "x.csv")
        self.assertIn(b"A,B", att["fcontent"])
        self.assertIn(b"hi,1", att["fcontent"])

    def test_build_html_body_escapes_and_includes_narrative(self):
        payload = {
            "title": "<dangerous>",
            "narrative": ["alpha & omega"],
            "columns": [{"key": "k", "label": "K", "type": "string"}],
            "rows": [{"k": "<v>"}],
        }
        html = _build_html_body(payload)
        self.assertIn("&lt;dangerous&gt;", html)
        self.assertIn("alpha &amp; omega", html)
        self.assertIn("&lt;v&gt;", html)
