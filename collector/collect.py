"""CLI entry point: python -m collector.collect -o raw.json.

Assembles the raw evidence snapshot consumed by the engine. Every
source failure is recorded in meta.skipped; the tool always exits 0
unless it cannot write its output file.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

from collector import devnodes, kconfig, modules, processes, sysctl, syscalls

KSL_VERSION = "0.1.0"

DEFAULT_TRACE_SECONDS = 5


def detect_distro() -> str:
    """Return a human distro string from /etc/os-release, with a fallback."""
    try:
        text = Path("/etc/os-release").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return f"non-linux ({platform.system()})"
    for line in text.splitlines():
        if line.startswith("PRETTY_NAME="):
            return line.split("=", 1)[1].strip().strip('"')
    return "unknown"


def collect_raw(trace_seconds: int = DEFAULT_TRACE_SECONDS) -> dict[str, object]:
    """Gather every read-only source into the raw evidence snapshot."""
    skips: list[dict[str, str]] = []

    kconfig_map = kconfig.parse_kconfig(skips)
    loaded = modules.loaded_modules(skips)
    available = modules.available_modules(skips)
    sysctls = sysctl.read_sysctls(skips=skips)
    vulnerabilities = sysctl.cpu_vulnerabilities(skips)
    lsms = sysctl.lsm_list(skips)
    lockdown = sysctl.lockdown_state(skips)
    boot_cmdline = sysctl.cmdline(skips)
    devnode_evidence = devnodes.collect_devnodes(skips=skips)
    procs = processes.enumerate_processes(skips)
    workloads = processes.group_workloads(procs)

    traced = syscalls.trace_syscalls(trace_seconds, backend="auto", skips=skips)
    trace_backend = syscalls.detect_backend() if traced else None

    return {
        "meta": {
            "kernel_release": platform.release(),
            "arch": platform.machine(),
            "distro": detect_distro(),
            "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "trace_seconds": trace_seconds,
            "trace_backend": trace_backend or "none",
            "ran_as_root": _is_root(),
            "ksl_version": KSL_VERSION,
            "skipped": skips,
        },
        "kconfig": dict(sorted(kconfig_map.items())),
        "modules_loaded": loaded,
        "modules_available": available,
        "sysctls": sysctls,
        "cpu_vulnerabilities": vulnerabilities,
        "lsm_list": lsms,
        "lockdown_state": lockdown,
        "cmdline": boot_cmdline,
        "devnodes": devnode_evidence,
        "workloads": workloads,
        "traced_syscalls": {str(pid): sorted(names) for pid, names in sorted(traced.items())},
    }


def _is_root() -> bool:
    """Best-effort root check across platforms."""
    try:
        return hasattr(os, "geteuid") and os.geteuid() == 0
    except Exception:
        return False


def main(argv: list[str] | None = None) -> int:
    """Run collection and write raw.json."""
    parser = argparse.ArgumentParser(prog="collector", description=__doc__)
    parser.add_argument("-o", "--output", default="raw.json", help="output path (default: raw.json)")
    parser.add_argument(
        "--trace-seconds",
        type=int,
        default=DEFAULT_TRACE_SECONDS,
        help="syscall observation window in seconds; 0 disables tracing (default: %(default)s)",
    )
    args = parser.parse_args(argv)

    snapshot = collect_raw(trace_seconds=args.trace_seconds)
    out = Path(args.output)
    out.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"wrote {out}")
    print(
        f"kernel={snapshot['meta']['kernel_release']} "
        f"kconfig_symbols={len(snapshot['kconfig'])} "
        f"loaded_modules={len(snapshot['modules_loaded'])} "
        f"autoloadable={len(snapshot['modules_available'])} "
        f"workloads={len(snapshot['workloads'])} "
        f"skipped={len(snapshot['meta']['skipped'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
