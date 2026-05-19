"""
Coverage configuration validation.
TRD-018 | Backend test coverage >=80% must be measured, not just passing.
"""
import os
import re
import unittest

REPO_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)


class TestCoverageConfig(unittest.TestCase):
    """TRD-018 | Coverage measurement configured in pyproject.toml and CI."""

    def _read(self, rel_path: str) -> str:
        path = os.path.join(REPO_ROOT, rel_path)
        self.assertTrue(os.path.exists(path), f"{rel_path} must exist")
        with open(path) as f:
            return f.read()

    def test_pyproject_has_coverage_run_section(self):
        """TRD-018 | [tool.coverage.run] section must declare source = vernon_tasks."""
        content = self._read("pyproject.toml")
        self.assertIn("[tool.coverage.run]", content)
        self.assertIn("source", content)
        self.assertIn("vernon_tasks", content)

    def test_coverage_fail_under_is_80_or_more(self):
        """TRD-018 | [tool.coverage.report] fail_under must be >=80."""
        content = self._read("pyproject.toml")
        self.assertIn("[tool.coverage.report]", content)
        match = re.search(r"fail_under\s*=\s*(\d+)", content)
        self.assertIsNotNone(match, "fail_under must be set in [tool.coverage.report]")
        self.assertGreaterEqual(int(match.group(1)), 80)

    def test_ci_workflow_installs_coverage_tool(self):
        """TRD-018 | CI backend job must install pytest-cov or coverage."""
        content = self._read(".github/workflows/test.yml")
        has_cov = "pytest-cov" in content or "coverage" in content
        self.assertTrue(has_cov, "CI workflow must install coverage tooling")

    def test_ci_workflow_runs_with_coverage_flag(self):
        """TRD-018 | CI run-tests command must include --coverage flag."""
        content = self._read(".github/workflows/test.yml")
        self.assertIn("--coverage", content)
