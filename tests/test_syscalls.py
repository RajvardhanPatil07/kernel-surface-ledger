"""Parser unit tests for collector/syscalls.py.

TASKS.md Task 2: captured sample output from each backend lives under
tests/fixtures/syscalls/ and these tests need no root and no tracer
binaries. Degradation paths are exercised directly against
trace_syscalls.
"""

from __future__ import annotations

import unittest
from pathlib import Path

from collector.syscalls import (
    detect_backend,
    parse_bcc_json,
    parse_perf_summary,
    parse_strace_summary,
    trace_syscalls,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "syscalls"


def _fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class BccParserTest(unittest.TestCase):
    def test_sample_output_parses_per_pid(self) -> None:
        traced = parse_bcc_json(_fixture("bcc_syscount.json"))
        self.assertEqual(
            {812: {"epoll_wait", "accept4"}, 913: {"io_uring_enter", "userfaultfd"}},
            traced,
        )

    def test_garbage_yields_empty_not_crash(self) -> None:
        self.assertEqual({}, parse_bcc_json("not json at all"))
        self.assertEqual({}, parse_bcc_json('{"pid": 1}'))
        self.assertEqual({}, parse_bcc_json("[]"))


class PerfParserTest(unittest.TestCase):
    def test_sample_output_groups_by_section(self) -> None:
        traced = parse_perf_summary(_fixture("perf_summary.txt"))
        self.assertEqual(
            {
                812: {"epoll_wait", "accept4", "futex"},
                913: {"io_uring_enter", "keyctl", "bpf"},
            },
            traced,
        )

    def test_rows_without_percentage_column_parse(self) -> None:
        traced = parse_perf_summary("curl (77), 10 events, 1.0%\n\n   40 read\n")
        self.assertEqual({77: {"read"}}, traced)


class StraceParserTest(unittest.TestCase):
    def test_sample_table_extracts_names_only(self) -> None:
        names = parse_strace_summary(_fixture("strace_c.txt"))
        self.assertEqual({"epoll_wait", "openat", "io_uring_setup"}, names)

    def test_total_row_and_headers_never_leak(self) -> None:
        names = parse_strace_summary(
            "% time     seconds  usecs/call     calls    errors syscall\n"
            "------ ----------- ----------- --------- --------- ----\n"
            "100.00    0.004500                   122        10 total\n"
        )
        self.assertEqual(set(), names)


class TraceSyscallsDegradationTest(unittest.TestCase):
    def test_unknown_backend_records_skip(self) -> None:
        skips: list[dict[str, str]] = []
        self.assertEqual({}, trace_syscalls(5, backend="nosuchtool", skips=skips))
        self.assertEqual("no usable backend", skips[0]["reason"])

    def test_auto_without_binaries_records_skip(self) -> None:
        skips: list[dict[str, str]] = []
        result = trace_syscalls(0, backend="auto", skips=skips)
        self.assertEqual({}, result)
        self.assertTrue(skips, "a reason must always be recorded")

    def test_zero_window_refused_before_spawning(self) -> None:
        skips: list[dict[str, str]] = []
        chosen = detect_backend()
        if chosen is None:
            self.skipTest("no tracer on this host")
        result = trace_syscalls(0, backend=chosen, skips=skips)
        self.assertEqual({}, result)
        self.assertIn("zero seconds", skips[0]["reason"])


if __name__ == "__main__":
    unittest.main()
