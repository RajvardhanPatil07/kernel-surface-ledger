"""Sysctl, LSM, lockdown and command-line state readers.

Reads only the sysctls named in data/weights.yaml (the curated gate
list) plus the exposure surfaces that inform reachability: the CPU
hardware-vulnerability reports, the loaded-LSM list, the lockdown
state and the kernel command line. Nothing here ever writes.
"""

from __future__ import annotations

from pathlib import Path

SYSCTL_BASE = Path("/proc/sys")

SYSCTL_NAMES: tuple[str, ...] = (
    "kernel.unprivileged_userns_clone",
    "user.max_user_namespaces",
    "kernel.unprivileged_bpf_disabled",
    "vm.unprivileged_userfaultfd",
    "kernel.perf_event_paranoid",
    "kernel.kptr_restrict",
    "kernel.dmesg_restrict",
    "kernel.modules_disabled",
    "kernel.io_uring_disabled",
    "kernel.kexec_load_disabled",
    "kernel.yama.ptrace_scope",
    "fs.protected_symlinks",
    "fs.protected_hardlinks",
    "fs.suid_dumpable",
)


def _read_proc_value(path: Path, skips: list[dict[str, str]], source: str) -> str | None:
    """Read a single sysfs/proc value, recording any failure."""
    try:
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except FileNotFoundError:
        skips.append({"source": source, "reason": "not present"})
    except PermissionError as exc:
        skips.append({"source": source, "reason": f"permission denied: {exc}"})
    except OSError as exc:
        skips.append({"source": source, "reason": str(exc)})
    return None


def read_sysctls(
    names: tuple[str, ...] = SYSCTL_NAMES,
    skips: list[dict[str, str]] | None = None,
) -> dict[str, str]:
    """Return current values for every readable sysctl in `names`."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    values: dict[str, str] = {}
    for name in names:
        path = SYSCTL_BASE.joinpath(*name.split("."))
        value = _read_proc_value(path, skipped, f"sysctl:{name}")
        if value is not None:
            values[name] = value
    return dict(sorted(values.items()))


def cpu_vulnerabilities(skips: list[dict[str, str]] | None = None) -> dict[str, str]:
    """Return the per-mitigation report under /sys/devices/system/cpu/vulnerabilities."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    base = Path("/sys/devices/system/cpu/vulnerabilities")
    try:
        files = sorted(base.iterdir())
    except FileNotFoundError:
        skipped.append({"source": "cpu:vulnerabilities", "reason": "not present"})
        return {}
    except PermissionError as exc:
        skipped.append({"source": "cpu:vulnerabilities", "reason": f"permission denied: {exc}"})
        return {}
    except OSError as exc:
        skipped.append({"source": "cpu:vulnerabilities", "reason": str(exc)})
        return {}
    report: dict[str, str] = {}
    for entry in files:
        value = _read_proc_value(entry, skipped, f"cpu:vulnerabilities/{entry.name}")
        if value is not None:
            report[entry.name] = value
    return report


def lsm_list(skips: list[dict[str, str]] | None = None) -> list[str]:
    """Return the active Linux Security Module names, in activation order."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    text = _read_proc_value(Path("/sys/kernel/security/lsm"), skipped, "lsm:list")
    if not text:
        return []
    return sorted(filter(None, (part.strip() for part in text.split(","))))


def lockdown_state(skips: list[dict[str, str]] | None = None) -> str | None:
    """Return the raw /sys/kernel/security/lockdown line.

    Example content: "[none] integrity confidentiality" — bracketed term
    is the active level.
    """
    skipped: list[dict[str, str]] = [] if skips is None else skips
    return _read_proc_value(Path("/sys/kernel/security/lockdown"), skipped, "lsm:lockdown")


def cmdline(skips: list[dict[str, str]] | None = None) -> str:
    """Return the running kernel's boot command line."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    return _read_proc_value(Path("/proc/cmdline"), skipped, "cmdline") or ""
