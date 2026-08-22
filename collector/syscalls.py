"""Per-workload syscall observation.

Three backends (bcc, perf, strace) sit behind one signature. This file
currently provides backend *detection* and the deterministic no-op path:
actual tracing parsers land with the runner integration. When no backend
is available the pipeline must still work — used=false everywhere, with
the engine treating syscall usage as unknown rather than orphaned.
"""

from __future__ import annotations

import shutil
from pathlib import Path

BACKEND_PROBES: tuple[tuple[str, str], ...] = (
    ("bcc", "syscount"),
    ("perf", "perf"),
    ("strace", "strace"),
)


def detect_backend() -> str | None:
    """Probe for tracer binaries in PATH, in preference order."""
    for backend, binary in BACKEND_PROBES:
        if shutil.which(binary) is not None:
            return backend
    return None


def trace_syscalls(
    seconds: int,
    backend: str = "auto",
    skips: list[dict[str, str]] | None = None,
) -> dict[int, set[str]]:
    """Return {pid: set(syscall names)} observed over an N-second window.

    Returns {} and records a skip entry when no usable backend exists;
    callers must treat that as "unknown", never as evidence of absence.
    """
    skipped: list[dict[str, str]] = [] if skips is None else skips
    chosen = detect_backend() if backend == "auto" else backend
    if chosen is None or not Path("/proc").exists():
        skipped.append({"source": f"trace:{chosen or 'auto'}", "reason": "no tracer available"})
        return {}
    skipped.append({"source": f"trace:{chosen}", "reason": "parser lands with runner integration"})
    return {}
