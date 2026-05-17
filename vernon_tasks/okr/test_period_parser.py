import unittest
from datetime import date
from vernon_tasks.okr.period_parser import parse_period


class TestParsePeriod(unittest.TestCase):
    def test_quarter(self):
        self.assertEqual(parse_period("2026-Q2"), (date(2026, 4, 1), date(2026, 6, 30)))
        self.assertEqual(parse_period("2026-Q1"), (date(2026, 1, 1), date(2026, 3, 31)))
        self.assertEqual(parse_period("2026-Q4"), (date(2026, 10, 1), date(2026, 12, 31)))

    def test_half(self):
        self.assertEqual(parse_period("2026-H1"), (date(2026, 1, 1), date(2026, 6, 30)))
        self.assertEqual(parse_period("2026-H2"), (date(2026, 7, 1), date(2026, 12, 31)))

    def test_year(self):
        self.assertEqual(parse_period("2026"), (date(2026, 1, 1), date(2026, 12, 31)))

    def test_unknown(self):
        self.assertIsNone(parse_period("foo"))
        self.assertIsNone(parse_period(""))
        self.assertIsNone(parse_period(None))
