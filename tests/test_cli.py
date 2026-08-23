"""End-to-end CLI tests: ksl.py scan over the committed raw fixture."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from ksl import main as ksl_main

ROOT = Path(__file__).resolve().parent.parent
RAW = str(ROOT / "fixtures" / "raw-demo.json")


def strip_narrative(report: dict) -> dict:
    """Remove every field the LLM layer may write."""
    out = json.loads(json.dumps(report))
    out.pop("ledger")
    for step in out["plan"]:
        for field in ("breakage_note", "detection", "revert", "artifact"):
            step.pop(field, None)
    return out


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out1 = str(Path(self.tmp.name) / "r1.json")
        self.out2 = str(Path(self.tmp.name) / "r2.json")

    def test_scan_produces_schema_valid_report(self) -> None:
        from engine.report import validate_report

        self.assertEqual(0, ksl_main(["scan", "--raw", RAW, "-o", self.out1]))
        validate_report(json.loads(Path(self.out1).read_text()))

    def test_explain_toggle_yields_identical_numerics(self) -> None:
        """--no-explain must not move a single scored value."""
        self.assertEqual(0, ksl_main(["scan", "--raw", RAW, "-o", self.out1]))
        self.assertEqual(0, ksl_main(["scan", "--raw", RAW, "-o", self.out2, "--no-explain"]))
        r1 = json.loads(Path(self.out1).read_text())
        r2 = json.loads(Path(self.out2).read_text())
        self.assertEqual(strip_narrative(r1), strip_narrative(r2))

    def test_check_accepts_good_and_rejects_bad(self) -> None:
        self.assertEqual(0, ksl_main(["scan", "--raw", RAW, "-o", self.out1]))
        self.assertEqual(0, ksl_main(["check", self.out1]))
        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text('{"meta": {}}')
        self.assertEqual(1, ksl_main(["check", str(bad)]))

    def test_scan_missing_raw_fails_cleanly(self) -> None:
        """A missing snapshot must print an error, never a traceback."""
        missing = str(Path(self.tmp.name) / "absent.json")
        with contextlib.redirect_stderr(io.StringIO()) as err:
            with self.assertRaises(SystemExit) as ctx:
                ksl_main(["scan", "--raw", missing, "-o", self.out1])
        self.assertEqual(1, ctx.exception.code)
        self.assertIn("does not exist", err.getvalue())

    def test_scan_garbage_raw_fails_cleanly(self) -> None:
        garbage = Path(self.tmp.name) / "garbage.json"
        garbage.write_text("not json{")
        with contextlib.redirect_stderr(io.StringIO()) as err:
            with self.assertRaises(SystemExit) as ctx:
                ksl_main(["scan", "--raw", str(garbage), "-o", self.out1])
        self.assertEqual(1, ctx.exception.code)
        self.assertIn("not valid JSON", err.getvalue())

    def test_version_works_without_subcommand(self) -> None:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(0, ksl_main(["--version"]))
        self.assertTrue(buf.getvalue().strip())


if __name__ == "__main__":
    unittest.main()
