import unittest
from vernon_tasks.okr.pdca import next_pdca_phase, PDCA_SEQUENCE


class TestPdcaSequence(unittest.TestCase):
    def test_sequence_constant(self):
        self.assertEqual(PDCA_SEQUENCE, ["PLAN", "DO", "CHECK", "ACT", "CLOSED"])

    def test_advance(self):
        self.assertEqual(next_pdca_phase("PLAN"), "DO")
        self.assertEqual(next_pdca_phase("DO"), "CHECK")
        self.assertEqual(next_pdca_phase("CHECK"), "ACT")
        self.assertEqual(next_pdca_phase("ACT"), "CLOSED")

    def test_closed_returns_none(self):
        self.assertIsNone(next_pdca_phase("CLOSED"))

    def test_unknown_returns_none(self):
        self.assertIsNone(next_pdca_phase("INVALID"))
        self.assertIsNone(next_pdca_phase(None))
