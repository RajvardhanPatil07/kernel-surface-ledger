"""Report assembly tests: schema validity, determinism, LLM-independence."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator

from tests.synthetic import RAW_MINIMAL, load_cve_map, load_weights, raw_with_trace_none

from engine import report

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "report.schema.json").read_text())


class ReportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = report.build_report(RAW_MINIMAL, load_weights(), load_cve_map())

    def test_report_validates_against_frozen_schema(self) -> None:
        errors = sorted(
            Draft7Validator(SCHEMA).iter_errors(self.report), key=lambda e: list(e.path)
        )
        self.assertEqual([], [f"{list(e.path)}: {e.message}" for e in errors])

    def test_byte_identical_across_runs(self) -> None:
        again = report.build_report(RAW_MINIMAL, load_weights(), load_cve_map())
        self.assertEqual(
            json.dumps(self.report), json.dumps(again),
            "insertion order must also be deterministic, not just key order",
        )

    def test_no_trace_snapshot_still_produces_valid_report(self) -> None:
        raw = raw_with_trace_none()
        built = report.build_report(raw, load_weights(), load_cve_map())
        errors = list(Draft7Validator(SCHEMA).iter_errors(built))
        self.assertEqual([], errors)

    def test_score_fields_match_elements(self) -> None:
        elements = self.report["surface_elements"]
        total = sum(e["weight"] for e in elements)
        reachable = sum(e["weight"] for e in elements if e["reachable_unpriv"])
        self.assertAlmostEqual(total, self.report["score"]["total_surface_weight"], places=2)
        self.assertAlmostEqual(reachable, self.report["score"]["reachable_surface_weight"], places=2)

    def test_orphan_ratio_recomputes(self) -> None:
        ratio = self.report["orphaned"]["total_weight"] / max(
            self.report["score"]["reachable_surface_weight"], 1.0
        )
        self.assertAlmostEqual(ratio, self.report["score"]["orphan_ratio"], places=2)

    def test_explanations_empty_without_llm(self) -> None:
        for row in self.report["ledger"]:
            self.assertEqual("", row["explanation"])


if __name__ == "__main__":
    unittest.main()
