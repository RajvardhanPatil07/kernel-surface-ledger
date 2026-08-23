"""Per-workload syscall observation.

Three backends sit behind one signature:

    bcc     syscount -P -d <N> -j          JSON counts grouped per process
    perf    perf trace -s -a -- sleep N    per-thread syscall summary
    strace  strace -f -c -p <pid>          fanned out over the top N pids
                                           by CPU time; each run is stopped
                                           with SIGINT after the window and
                                           parsed from its aggregate table

"auto" probes in that preference order. Every failure mode degrades to an
empty observation plus a reason recorded in meta.skipped: a missing binary,
an attach refusal, a zero-second window, or an unparseable dump never
crashes collection. Callers must treat {} as "unknown", never as evidence
of absence.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

BACKEND_PROBES: tuple[tuple[str, str], ...] = (
    ("bcc", "syscount"),
    ("perf", "perf"),
    ("strace", "strace"),
)

MAX_STRACE_TARGETS = 8
STRACE_STOP_GRACE_SECONDS = 10

_PERF_SECTION = re.compile(r"^\s*(\S+)\s+\((\d+)\),")
_PERF_ROW = re.compile(r"^(?:[\d.]+%\s+)?(\d+)\s+([A-Za-z_][A-Za-z0-9_]*)$")
_STRACE_ROW = re.compile(
    r"^[\d.]+\s+[\d.]+\s+\d+\s+\d+(?:\s+\d+)?\s+([a-z][a-z0-9_]*)$"
)


def detect_backend() -> str | None:
    """Probe for tracer binaries in PATH, in preference order."""
    for backend, binary in BACKEND_PROBES:
        if shutil.which(binary) is not None:
            return backend
    return None


def parse_bcc_json(text: str) -> dict[int, set[str]]:
    """Parse ``syscount -P -j`` output into {pid: {syscall names}}."""
    try:
        rows = json.loads(text)
    except json.JSONDecodeError:
        return {}
    if not isinstance(rows, list):
        return {}
    traced: dict[int, set[str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            pid = int(row["pid"])
            name = str(row["syscall"])
        except (KeyError, TypeError, ValueError):
            continue
        if name:
            traced.setdefault(pid, set()).add(name)
    return traced


def parse_perf_summary(text: str) -> dict[int, set[str]]:
    """Parse ``perf trace -s`` per-thread summaries into {pid: {names}}.

    Sections look like::

        curl (8123), 4203 events, 41.2%

           95.62%   4021  epoll_wait

    The percentage column is optional; anything that is not a count/name
    pair inside a section is ignored.
    """
    traced: dict[int, set[str]] = {}
    current: int | None = None
    for line in text.splitlines():
        header = _PERF_SECTION.match(line)
        if header:
            current = int(header.group(2))
            continue
        if current is None:
            continue
        row = _PERF_ROW.match(line.strip())
        if row:
            traced.setdefault(current, set()).add(row.group(2))
    return traced


def parse_strace_summary(text: str) -> set[str]:
    """Parse one ``strace -c`` aggregate table into its syscall names.

    A data row is: percent, seconds, usecs/call, calls, [errors], syscall;
    headers, dash rules, attach chatter, and the trailing ``total`` row are
    ignored.
    """
    names: set[str] = set()
    for line in text.splitlines():
        row = _STRACE_ROW.match(line.strip())
        if row and row.group(1) != "total":
            names.add(row.group(1))
    return names


def _top_cpu_pids(limit: int) -> list[int]:
    """Return up to `limit` pids sorted by accumulated CPU time desc, pid asc."""
    scored: list[tuple[int, int]] = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            stat = (Path("/proc") / entry / "stat").read_text(
                encoding="utf-8", errors="replace"
            )
        except OSError:
            continue
        close = stat.rfind(")")
        fields = stat[close + 1 :].split()
        if len(fields) < 13:
            continue
        cpu_ticks = int(fields[11]) + int(fields[12])
        scored.append((cpu_ticks, int(entry)))
    return [pid for _, pid in sorted(scored, key=lambda s: (-s[0], s[1]))[:limit]]


def _capture(cmd: list[str], timeout: int) -> str:
    """Run a command, return merged output; raise on non-zero exit."""
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"{cmd[0]} exited {completed.returncode}")
    return completed.stdout + "\n" + completed.stderr


def _run_bcc(seconds: int, skipped: list[dict[str, str]]) -> dict[int, set[str]]:
    del skipped
    text = _capture(["syscount", "-P", "-d", str(seconds), "-j"], seconds + 60)
    return parse_bcc_json(text)


def _run_perf(seconds: int, skipped: list[dict[str, str]]) -> dict[int, set[str]]:
    del skipped
    text = _capture(["perf", "trace", "-s", "-a", "--", "sleep", str(seconds)], seconds + 60)
    return parse_perf_summary(text)


def _run_strace(seconds: int, skipped: list[dict[str, str]]) -> dict[int, set[str]]:
    """Attach to each of the top CPU consumers, stop it, parse its table."""
    traced: dict[int, set[str]] = {}
    for pid in _top_cpu_pids(MAX_STRACE_TARGETS):
        try:
            proc = subprocess.Popen(
                ["strace", "-f", "-c", "-q", "-p", str(pid)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
            )
        except OSError as exc:
            skipped.append(
                {"source": f"trace:strace:{pid}", "reason": f"attach failed: {exc}"}
            )
            continue
        time.sleep(seconds)
        try:
            proc.send_signal(signal.SIGINT)
            out, _ = proc.communicate(timeout=STRACE_STOP_GRACE_SECONDS)
        except (OSError, subprocess.TimeoutExpired):
            proc.kill()
            proc.communicate()
            skipped.append(
                {"source": f"trace:strace:{pid}", "reason": "did not stop cleanly"}
            )
            continue
        names = parse_strace_summary(out or "")
        if names:
            traced[pid] = names
    return traced


_RUNNERS = {
    "bcc": _run_bcc,
    "perf": _run_perf,
    "strace": _run_strace,
}


def trace_syscalls(
    seconds: int,
    backend: str = "auto",
    skips: list[dict[str, str]] | None = None,
) -> dict[int, set[str]]:
    """Return {pid: set(syscall names)} observed over an N-second window.

    Returns {} and records a skip entry whenever tracing cannot run; the
    pipeline keeps working with used=false everywhere.
    """
    skipped: list[dict[str, str]] = [] if skips is None else skips
    chosen = detect_backend() if backend == "auto" else backend
    runner = _RUNNERS.get(chosen or "")
    if runner is None:
        skipped.append(
            {"source": f"trace:{chosen or backend}", "reason": "no usable backend"}
        )
        return {}
    if not Path("/proc").exists():
        skipped.append({"source": f"trace:{chosen}", "reason": "/proc unavailable"})
        return {}
    if seconds <= 0:
        skipped.append(
            {"source": f"trace:{chosen}", "reason": "observation window is zero seconds"}
        )
        return {}
    try:
        traced = runner(seconds, skipped)
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        skipped.append(
            {"source": f"trace:{chosen}", "reason": f"{type(exc).__name__}: {exc}"}
        )
        return {}
    if not traced:
        skipped.append({"source": f"trace:{chosen}", "reason": "no syscalls observed"})
    return traced
