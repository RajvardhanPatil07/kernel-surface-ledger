"""Regression tests for graceful degradation in collector/processes.py.

AGENTS.md rule 3: every read of /proc must tolerate PermissionError, record
the reason, and continue. These tests simulate the exact non-root failure
seen on Linux CI hosts (PermissionError on /proc/<pid>/exe).
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from collector.processes import enumerate_processes, read_process


class _FakePidDir:
    """Minimal stand-in exposing only the attributes read_process touches."""

    def __init__(self, base: Path, name: str) -> None:
        self.name = name
        self._base = base

    def __truediv__(self, other: str) -> Path:
        return self._base / other


def _raise_permission_denied(path: os.PathLike) -> str:
    raise PermissionError(13, "Permission denied", str(path))


class ReadProcessDegradationTest(unittest.TestCase):
    def test_permission_error_is_recorded_not_raised(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            skips: list[dict[str, str]] = []
            pid_dir = _FakePidDir(Path(tmp), "1")
            original_readlink = os.readlink
            os.readlink = _raise_permission_denied  # type: ignore[assignment]
            try:
                result = read_process(pid_dir, skips)
            finally:
                os.readlink = original_readlink  # type: ignore[assignment]
            self.assertIsNone(result)
            self.assertTrue(skips, "skip reason must be recorded")
            self.assertEqual(skips[0]["source"], "process:1")
            self.assertIn("Permission denied", skips[0]["reason"])

    def test_enumerate_processes_survives_missing_proc(self) -> None:
        """On a host without /proc (e.g. macOS) the collector yields no workloads."""
        processes = enumerate_processes()
        self.assertIsInstance(processes, list)


if __name__ == "__main__":
    unittest.main()
