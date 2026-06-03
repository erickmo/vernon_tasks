"""Guard: the Tugas Saya tab + focus-panel asset stay wired into vt-home.

There is no JS DOM test harness in this app, so this is a source-level wiring
guard — it fails loudly if a refactor drops the tab button, the lazy render
call, or the asset registration. PRD: merge-my-work-into-vt-home.
"""
import os
import unittest

import vernon_tasks

_APP_DIR = os.path.dirname(vernon_tasks.__file__)


def _read(rel_path: str) -> str:
    with open(os.path.join(_APP_DIR, rel_path), encoding="utf-8") as fh:
        return fh.read()


class TestFocusPanelWiring(unittest.TestCase):
    def test_vt_home_has_tugas_saya_tab(self):  # PRD: merge-my-work-into-vt-home
        js = _read("task/page/vt_home/vt_home.js")
        self.assertIn('data-tab="tugas-saya"', js)
        self.assertIn('data-panel="tugas-saya"', js)
        self.assertIn("vt_render_focus_panel", js)

    def test_focus_asset_registered(self):  # PRD: merge-my-work-into-vt-home
        hooks = _read("hooks.py")
        self.assertIn("js/vt_focus_panel.js", hooks)
