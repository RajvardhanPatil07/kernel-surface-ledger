"""Explain-layer tests: numeric identity, caching, fallback safety.

The network is never touched: _cached_or_fetch is stubbed at the
explain.explain boundary, and the cache directory is redirected to a
temp path so the committed cache is not polluted.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tests.synthetic import RAW_MINIMAL, load_cve_map, load_weights

from engine import report
import explain.explain as ex


def build() -> dict:
    return report.build_report(RAW_MINIMAL, load_weights(), load_cve_map())


class ExplainTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(ex, "CACHE_DIR", Path(self.tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.base = build()

    def test_numeric_fields_identical_with_llm(self) -> None:
        """THE invariant: the LLM layer cannot move a single number."""
        responses = {
            "You are a Linux kernel security analyst": "Narrative text.",
            "You predict operational breakage": json.dumps(
                {
                    "breakage_risk": "high",
                    "breakage_note": "nginx could break.",
                    "detection": "systemctl status nginx",
                    "revert": "undo it",
                    "requires_reboot": False,
                }
            ),
        }

        def fake_fetch(prompt: str) -> str | None:
            for prefix, answer in responses.items():
                if prompt.startswith(prefix):
                    return answer
            return None

        with mock.patch.object(ex, "_cached_or_fetch", side_effect=fake_fetch):
            enriched = ex.explain_report(self.base)

        self.assertEqual(
            self.base["score"], enriched["score"], "score must never change"
        )
        self.assertEqual(
            self.base["surface_elements"], enriched["surface_elements"]
        )
        self.assertEqual(self.base["workloads"], enriched["workloads"])
        self.assertEqual(self.base["orphaned"], enriched["orphaned"])
        for before, after in zip(self.base["ledger"], enriched["ledger"]):
            self.assertEqual(
                {k: v for k, v in before.items() if k != "explanation"},
                {k: v for k, v in after.items() if k != "explanation"},
            )
        for before, after in zip(self.base["plan"], enriched["plan"]):
            self.assertEqual(
                {k: v for k, v in before.items()
                 if k not in ("breakage_note", "detection", "revert", "artifact")},
                {k: v for k, v in after.items()
                 if k not in ("breakage_note", "detection", "revert", "artifact")},
            )
        self.assertEqual(self.base["plan"][0]["artifact"]["content"],
                         enriched["plan"][0]["artifact"]["content"])

    def test_narrative_fields_filled(self) -> None:
        def fake_fetch(prompt: str) -> str | None:
            if prompt.startswith("You are a Linux kernel security analyst"):
                return "This workload holds surface because it must."
            return None

        with mock.patch.object(ex, "_cached_or_fetch", side_effect=fake_fetch):
            enriched = ex.explain_report(self.base)
        for row in enriched["ledger"]:
            self.assertTrue(row["explanation"])

    def test_no_api_key_leaves_report_unchanged(self) -> None:
        with mock.patch.object(ex, "_cached_or_fetch", return_value=None):
            enriched = ex.explain_report(self.base)
        self.assertEqual(json.dumps(self.base, sort_keys=True),
                         json.dumps(enriched, sort_keys=True))

    def test_garbage_json_falls_back(self) -> None:
        with mock.patch.object(ex, "_cached_or_fetch", return_value="not json {"):
            enriched = ex.explain_report(self.base)
        for before, after in zip(self.base["plan"], enriched["plan"]):
            self.assertEqual(before["breakage_note"], after["breakage_note"])
            self.assertEqual(before["detection"], after["detection"])

    def test_cache_hit_avoids_refetch(self) -> None:
        calls: list[str] = []

        def fake_chat(prompt: str, base: str, key: str, model: str) -> str | None:
            calls.append(prompt[:40])
            return "cached answer"

        prompt = "You are a Linux kernel security analyst\ntest"
        with mock.patch.dict("os.environ",
                             {"KSL_API_BASE": "http://x", "KSL_API_KEY": "k", "KSL_MODEL": "m"}):
            with mock.patch.object(ex, "_chat", side_effect=fake_chat):
                self.assertEqual("cached answer", ex._cached_or_fetch(prompt))
                self.assertEqual("cached answer", ex._cached_or_fetch(prompt))
        self.assertEqual(1, len(calls), "second call must come from the disk cache")


if __name__ == "__main__":
    unittest.main()
